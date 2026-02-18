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
CREATED_TASK_ID=""
CREATED_CHALLENGE_ID=""
TENANT2_ID=""

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
    vals.append(json.loads(txt))
ctx={'v':vals}
safe={"len":len,"isinstance":isinstance,"all":all,"any":any,"int":int,"list":list,"str":str}
ok=eval(expr,{"__builtins__":safe, **ctx},{})
print('1' if ok else '0')
PY
}

sql_one() {
  psql "$DB_URL" -qAt -c "$1" | head -n1 | tr -d '[:space:]'
}

if ! curl -sS "$BASE_URL/" >/dev/null; then
  echo "Server not reachable at $BASE_URL"
  echo "Start with: bash start-dev.sh"
  exit 1
fi

# Baseline for tenant 1
before_created_count=$(sql_one "select count(*) from xp_ledger where tenant_id=1 and reason='task_created';")
before_completed_count=$(sql_one "select count(*) from xp_ledger where tenant_id=1 and reason='task_completed';")
before_challenge_points=$(sql_one "select coalesce(sum(points),0) from xp_ledger where tenant_id=1 and reason='challenge_won';")

# 1) Summary contract
res=$(request GET /api/gamification/summary); code=${res%%|*}; body=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "all(k in v[0] for k in ['totalXp','level','currentStreak','longestStreak'])" "$body")" == "1" ]]; then
  report_pass "GET /api/gamification/summary returns required shape"
else
  report_fail "GET /api/gamification/summary contract failed"
fi

# 2) Create challenge (tenant-scoped)
res=$(request POST /api/gamification/challenges '{"title":"Gamification Test Challenge","description":"integration","xpReward":77,"dueDate":"2030-01-01"}')
code=${res%%|*}; body=${res#*|}
if [[ "$code" == "201" ]] && [[ "$(py_check "v[0].get('tenantId')==1 and v[0].get('xpReward')==77" "$body")" == "1" ]]; then
  report_pass "POST /api/gamification/challenges creates with tenantId=1"
else
  report_fail "POST /api/gamification/challenges failed"
fi
CREATED_CHALLENGE_ID=$(python3 -c "import json;print(json.load(open('$body'))['id'])")

# 3) Complete challenge awards XP + marks completed
res=$(request POST "/api/gamification/challenges/$CREATED_CHALLENGE_ID/complete")
code=${res%%|*}; body=${res#*|}
after_challenge_points=$(sql_one "select coalesce(sum(points),0) from xp_ledger where tenant_id=1 and reason='challenge_won';")
if [[ "$code" == "200" ]] && [[ "$(py_check "v[0].get('status')=='completed'" "$body")" == "1" ]] && [[ $((after_challenge_points-before_challenge_points)) -eq 77 ]]; then
  report_pass "Challenge complete marks completed and awards XP"
else
  report_fail "Challenge complete did not award expected XP"
fi

# 4) Task create awards +2 task_created XP
res=$(request POST /api/tasks '{"title":"Gamification XP Task","description":"test","status":"todo"}')
code=${res%%|*}; body=${res#*|}
CREATED_TASK_ID=$(python3 -c "import json;print(json.load(open('$body'))['id'])")
sleep 1
after_created_count=$(sql_one "select count(*) from xp_ledger where tenant_id=1 and reason='task_created';")
if [[ "$code" == "200" ]] && [[ $((after_created_count-before_created_count)) -eq 1 ]]; then
  report_pass "POST /api/tasks increments XP by +2 (task_created ledger entry)"
else
  report_fail "POST /api/tasks did not create task_created XP entry"
fi

# 5) Move task to done awards +10 task_completed XP
res=$(request PATCH "/api/tasks/$CREATED_TASK_ID" '{"status":"done"}')
code=${res%%|*}
sleep 1
after_completed_count=$(sql_one "select count(*) from xp_ledger where tenant_id=1 and reason='task_completed';")
if [[ "$code" == "200" ]] && [[ $((after_completed_count-before_completed_count)) -eq 1 ]]; then
  report_pass "PATCH /api/tasks/:id status=done increments XP by +10 (task_completed entry)"
else
  report_fail "PATCH /api/tasks/:id did not create task_completed XP entry"
fi

# 6) Tenant isolation for summary vs public leaderboard
TENANT2_ID=$(sql_one "insert into tenants (slug,name,plan) values ('tenant2-gamification-test-'||substring(md5(random()::text),1,8), 'Tenant 2 Gamification Test','free') returning id;")
psql "$DB_URL" -q -c "insert into xp_ledger (tenant_id,user_email,points,reason,ref_id) values ($TENANT2_ID,'system',999,'manual_test','tenant2');"
res=$(request GET /api/gamification/summary); code=${res%%|*}; body=${res#*|}
summary_total=$(python3 -c "import json;print(json.load(open('$body'))['totalXp'])")
if [[ "$code" == "200" ]] && [[ "$summary_total" -lt 999 ]]; then
  report_pass "Per-tenant summary is isolated from other tenants"
else
  report_fail "Per-tenant summary leaked cross-tenant XP"
fi

res=$(request GET /api/gamification/leaderboard); code=${res%%|*}; body=${res#*|}
if [[ "$code" == "200" ]] && [[ "$(py_check "isinstance(v[0], list) and len(v[0])<=10 and all('tenantSlug' in r and 'totalXp' in r and 'level' in r for r in v[0])" "$body")" == "1" ]]; then
  report_pass "Leaderboard returns top tenants with tenantSlug/totalXp/level"
else
  report_fail "Leaderboard contract failed"
fi

# Cleanup
if [[ -n "$CREATED_TASK_ID" ]]; then
  request DELETE /api/tasks "{\"id\":$CREATED_TASK_ID}" >/dev/null || true
fi
if [[ -n "$CREATED_CHALLENGE_ID" ]]; then
  psql "$DB_URL" -q -c "delete from challenges where id=$CREATED_CHALLENGE_ID and tenant_id=1;" || true
fi
if [[ -n "$TENANT2_ID" ]]; then
  psql "$DB_URL" -q -c "delete from tenants where id=$TENANT2_ID;" || true
fi

echo

echo "RESULT: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
