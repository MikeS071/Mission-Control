#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
PROJECT_DIR="/home/openclaw/projects/openclaw-mission-control"
DB_URL="postgresql://openclaw@/mission_control?host=/var/run/postgresql"

cd "$PROJECT_DIR"
source .env.local
API_SECRET="${API_SECRET:-}"
if [[ -z "$API_SECRET" ]]; then
  echo "API_SECRET is missing"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $API_SECRET"
JSON_HEADER="Content-Type: application/json"

PASS=0
FAIL=0

report_pass() { PASS=$((PASS+1)); echo "✅ $1"; }
report_fail() { FAIL=$((FAIL+1)); echo "❌ $1"; }

request() {
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"
  local tmp_body
  tmp_body=$(mktemp)
  local status
  if [[ -n "$data" ]]; then
    status=$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "$AUTH_HEADER" -H "$JSON_HEADER" --data "$data")
  else
    status=$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "$AUTH_HEADER")
  fi
  echo "$status|$tmp_body"
}

request_no_auth() {
  local method="$1"; shift
  local path="$1"; shift
  local tmp_body
  tmp_body=$(mktemp)
  local status
  status=$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "$BASE_URL$path")
  echo "$status|$tmp_body"
}

py_check() {
  local expr="$1"; shift
  python3 - "$expr" "$@" <<'PY'
import json,sys
expr=sys.argv[1]
args=sys.argv[2:]
vals=[]
for p in args:
    with open(p,'r',encoding='utf-8') as f:
        txt=f.read().strip() or 'null'
    try: vals.append(json.loads(txt))
    except: vals.append(txt)
ctx={'v':vals}
safe={"len":len,"isinstance":isinstance,"all":all,"any":any,"int":int,"list":list}
ok=eval(expr,{"__builtins__":safe},ctx)
print('1' if ok else '0')
PY
}

# Ensure server is up
if ! curl -sS "$BASE_URL/" >/dev/null; then
  echo "Server not reachable at $BASE_URL"
  exit 1
fi

# Seed tenant 2 + cross-tenant fixtures directly in DB
TENANT2_ID=$(psql "$DB_URL" -qAt -c "INSERT INTO tenants (slug,name,plan) VALUES ('tenant2-test','Tenant 2 Test','free') ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id;" | tail -n1 | tr -d '[:space:]')
TENANT2_TASK_ID=$(psql "$DB_URL" -qAt -c "INSERT INTO tasks (tenant_id,title,description,goal,priority,status,tags,assigned_agent) VALUES ($TENANT2_ID,'Tenant2 private task','private','Goal 2','Low','todo','iso','agent2') RETURNING id;" | tail -n1 | tr -d '[:space:]')
psql "$DB_URL" -q -c "INSERT INTO events (tenant_id,task_id,agent_name,event_type,payload) VALUES ($TENANT2_ID,$TENANT2_TASK_ID,'tenant2-agent','tenant2_event','hidden from tenant1');"
psql "$DB_URL" -q -c "INSERT INTO heartbeats (tenant_id,source,status,payload,checked_at) VALUES ($TENANT2_ID,'tenant2-source','ok','{}',NOW());"
psql "$DB_URL" -q -c "INSERT INTO agent_stats (tenant_id,agent_name,tokens,cost_usd,recorded_at) VALUES ($TENANT2_ID,'tenant2-agent',42,'0.01',NOW());"

# 1) Auth checks
res=$(request_no_auth GET /api/tasks); code=${res%%|*}; body=${res#*|}
[[ "$code" == "401" ]] && report_pass "Missing auth returns 401" || report_fail "Missing auth expected 401 got $code"

bad=$(mktemp)
code=$(curl -sS -o "$bad" -w "%{http_code}" -H "Authorization: Bearer invalid-token" "$BASE_URL/api/tasks")
[[ "$code" == "401" ]] && report_pass "Invalid bearer token returns 401" || report_fail "Invalid bearer expected 401 got $code"

res=$(request GET /api/tenants/me); code=${res%%|*}; body=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "v[0].get('id')==1 and isinstance(v[0].get('memberCount'), int)" "$body")" == "1" ]]; then
  report_pass "Bearer token is mapped to tenant 1 (/api/tenants/me)"
else
  report_fail "Bearer token tenant mapping failed"
fi

# 2) API contracts and CRUD for tasks/events
res=$(request GET /api/tasks); code=${res%%|*}; tasks_before=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "isinstance(v[0], list)" "$tasks_before")" == "1" ]]; then
  report_pass "GET /api/tasks returns array"
else
  report_fail "GET /api/tasks contract failed"
fi

res=$(request POST /api/tasks '{"description":"no title provided"}'); code=${res%%|*}; created=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "v[0].get('title')=='Untitled Task' and v[0].get('tenantId')==1" "$created")" == "1" ]]; then
  report_pass "POST /api/tasks creates task and stamps tenantId=1"
else
  report_fail "POST /api/tasks create contract failed"
fi
CREATED_TASK_ID=$(python3 -c "import json;print(json.load(open('$created'))['id'])")

res=$(request GET /api/tasks); code=${res%%|*}; tasks_after_create=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "any(t.get('id')==$CREATED_TASK_ID for t in v[0])" "$tasks_after_create")" == "1" ]]; then
  report_pass "Created task visible in same tenant"
else
  report_fail "Created task not visible in same tenant"
fi

res=$(request PATCH /api/tasks "{\"id\":$CREATED_TASK_ID,\"status\":\"done\",\"priority\":\"high\"}"); code=${res%%|*}; patched=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "v[0].get('id')==$CREATED_TASK_ID and v[0].get('status')=='done' and v[0].get('priority')=='High'" "$patched")" == "1" ]]; then
  report_pass "PATCH /api/tasks updates task within tenant"
else
  report_fail "PATCH /api/tasks failed"
fi

res=$(request GET "/api/events?taskId=$CREATED_TASK_ID"); code=${res%%|*}; ev_for_task=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "all(e.get('taskId')==$CREATED_TASK_ID for e in v[0])" "$ev_for_task")" == "1" ]]; then
  report_pass "GET /api/events?taskId filters by taskId"
else
  report_fail "Event filtering failed"
fi

res=$(request POST /api/events '{"taskId":null,"agentName":"tester","eventType":"manual","payload":"hello"}'); code=${res%%|*}; created_event=${res#*|}
if [[ "$code" == "201" ]] && [[ "$(py_check "v[0].get('tenantId')==1 and v[0].get('eventType')=='manual'" "$created_event")" == "1" ]]; then
  report_pass "POST /api/events writes tenant-scoped event"
else
  report_fail "POST /api/events contract failed"
fi

res=$(request POST /api/agent-stats '{"tokens":100}'); code=${res%%|*}
[[ "$code" == "400" ]] && report_pass "POST /api/agent-stats requires agentName" || report_fail "POST /api/agent-stats missing agentName should 400 got $code"

res=$(request POST /api/agent-stats '{"agentName":"tenant1-test-agent","tokens":123,"costUsd":"0.12"}'); code=${res%%|*}; stat_body=${res#*|}
if [[ "$code" == "201" ]] && [[ "$(py_check "v[0].get('tenantId')==1 and v[0].get('agentName')=='tenant1-test-agent'" "$stat_body")" == "1" ]]; then
  report_pass "POST /api/agent-stats creates tenant-scoped stat"
else
  report_fail "POST /api/agent-stats create failed"
fi

# 3) Tenant isolation & cross-tenant behavior
res=$(request GET /api/tasks); code=${res%%|*}; t1_tasks=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "all(t.get('tenantId')==1 for t in v[0])" "$t1_tasks")" == "1" ]]; then
  report_pass "Tenant 1 task list only contains tenant 1 rows"
else
  report_fail "Tenant 1 task list leaked cross-tenant rows"
fi

res=$(request GET "/api/tasks/$TENANT2_TASK_ID"); code=${res%%|*}
[[ "$code" == "404" ]] && report_pass "Cross-tenant GET /api/tasks/[id] returns 404 (not 403)" || report_fail "Cross-tenant GET expected 404 got $code"

res=$(request PATCH /api/tasks "{\"id\":$TENANT2_TASK_ID,\"title\":\"hijack\"}"); code=${res%%|*}
[[ "$code" == "404" ]] && report_pass "Cross-tenant PATCH /api/tasks returns 404" || report_fail "Cross-tenant PATCH expected 404 got $code"

res=$(request DELETE /api/tasks "{\"id\":$TENANT2_TASK_ID}"); code=${res%%|*}
[[ "$code" == "404" ]] && report_pass "Cross-tenant DELETE /api/tasks returns 404" || report_fail "Cross-tenant DELETE expected 404 got $code"

res=$(request GET "/api/events?taskId=$TENANT2_TASK_ID"); code=${res%%|*}; ev_cross=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "isinstance(v[0], list) and len(v[0])==0" "$ev_cross")" == "1" ]]; then
  report_pass "Cross-tenant /api/events?taskId returns empty, not forbidden"
else
  report_fail "Cross-tenant /api/events?taskId should be empty"
fi

res=$(request GET /api/events); code=${res%%|*}; ev_all=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "all(e.get('taskId') != $TENANT2_TASK_ID for e in v[0])" "$ev_all")" == "1" ]]; then
  report_pass "Tenant 1 events exclude tenant 2 events"
else
  report_fail "Tenant 1 events leaked tenant 2 data"
fi

res=$(request GET /api/heartbeats); code=${res%%|*}; hb=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "isinstance(v[0], list) and all(r.get('source')!='tenant2-source' for r in v[0]) and len(v[0])>=1" "$hb")" == "1" ]]; then
  report_pass "Heartbeats are tenant-scoped and still queryable"
else
  report_fail "Heartbeats scope/regression failed"
fi

res=$(request GET /api/agent-stats); code=${res%%|*}; stats=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "isinstance(v[0], list) and all(r.get('agentName')!='tenant2-agent' for r in v[0]) and len(v[0])>=1" "$stats")" == "1" ]]; then
  report_pass "Agent stats are tenant-scoped and still queryable"
else
  report_fail "Agent stats scope/regression failed"
fi

# 4) Tenants endpoint contract
res=$(request GET /api/tenants/me); code=${res%%|*}; me=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "v[0].get('id')==1 and 'slug' in v[0] and isinstance(v[0].get('memberCount'), int)" "$me")" == "1" ]]; then
  report_pass "GET /api/tenants/me returns tenant info + memberCount"
else
  report_fail "GET /api/tenants/me contract failed"
fi

# 5) Regression: legacy data still there
if [[ "$(py_check "isinstance(v[0], list) and len(v[0])>=6" "$t1_tasks")" == "1" ]]; then
  report_pass "Regression: tenant 1 still has at least 6 original tasks"
else
  report_fail "Regression: expected at least 6 tasks in tenant 1"
fi

# cleanup created tenant1 task
res=$(request DELETE /api/tasks "{\"id\":$CREATED_TASK_ID}"); code=${res%%|*}
[[ "$code" == "200" ]] && report_pass "Cleanup: delete created tenant1 task" || report_fail "Cleanup delete failed"

echo
echo "RESULT: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
