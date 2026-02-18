#!/usr/bin/env bash
# Mission Control API test harness
# Usage: bash scripts/test-api.sh [base_url]
# Default base: http://127.0.0.1:3001
BASE="${1:-http://127.0.0.1:3001}"
PASS=0; FAIL=0

AUTH_HEADER=()
if [[ -n "${API_SECRET:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${API_SECRET}")
fi

assert() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "✅ $name"; ((PASS++))
  else
    echo "❌ $name — expected '$expected' got: $actual"; ((FAIL++))
  fi
}

http_code() {
  local method="$1" url="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -s -o /tmp/mc-test-body.json -w "%{http_code}" -X "$method" "$url" "${AUTH_HEADER[@]}" -H "content-type: application/json" -d "$body"
  else
    curl -s -o /tmp/mc-test-body.json -w "%{http_code}" -X "$method" "$url" "${AUTH_HEADER[@]}"
  fi
}

# 1) GET /api/tasks
code=$(http_code GET "$BASE/api/tasks")
body=$(cat /tmp/mc-test-body.json)
assert "GET /api/tasks status" "200" "$code"
assert "GET /api/tasks returns JSON array" "^\[" "$body"

# 2) POST /api/tasks
create_payload='{"title":"API Test Task","description":"created by test harness","goal":"Goal 1","priority":"Medium","status":"todo"}'
code=$(http_code POST "$BASE/api/tasks" "$create_payload")
body=$(cat /tmp/mc-test-body.json)
assert "POST /api/tasks status" "200" "$code"
assert "POST /api/tasks returns id" '"id"' "$body"
TASK_ID=$(echo "$body" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p' | head -n1)
if [[ -z "$TASK_ID" ]]; then
  echo "❌ Could not parse TASK_ID from: $body"; ((FAIL++))
fi

# 3) PATCH /api/tasks/:id
patch_payload='{"title":"API Test Task Updated","status":"in_progress"}'
code=$(http_code PATCH "$BASE/api/tasks/$TASK_ID" "$patch_payload")
body=$(cat /tmp/mc-test-body.json)
assert "PATCH /api/tasks/:id status" "200" "$code"
assert "PATCH /api/tasks/:id updated title" 'API Test Task Updated' "$body"

# 4) GET /api/events?taskId=:id
code=$(http_code GET "$BASE/api/events?taskId=$TASK_ID")
body=$(cat /tmp/mc-test-body.json)
assert "GET /api/events?taskId status" "200" "$code"
assert "GET /api/events?taskId returns task events" '"taskId":'$TASK_ID "$body"

# 5) POST /api/events
event_payload='{"taskId":'"$TASK_ID"',"agentName":"test-harness","eventType":"manual","payload":"manual test event"}'
code=$(http_code POST "$BASE/api/events" "$event_payload")
body=$(cat /tmp/mc-test-body.json)
assert "POST /api/events status" "201" "$code"
assert "POST /api/events created" '"eventType":"manual"' "$body"

# 6) GET /api/events?limit=5
code=$(http_code GET "$BASE/api/events?limit=5")
body=$(cat /tmp/mc-test-body.json)
assert "GET /api/events?limit=5 status" "200" "$code"
count=$(echo "$body" | grep -o '"id":' | wc -l | tr -d ' ')
if [[ "$count" -le 5 ]]; then
  echo "✅ GET /api/events?limit=5 returns <=5 events"; ((PASS++))
else
  echo "❌ GET /api/events?limit=5 returned $count events"; ((FAIL++))
fi

# 7) DELETE /api/tasks with body {id}
delete_payload='{"id":'"$TASK_ID"'}'
code=$(http_code DELETE "$BASE/api/tasks" "$delete_payload")
body=$(cat /tmp/mc-test-body.json)
assert "DELETE /api/tasks status" "200" "$code"
assert "DELETE /api/tasks ok" '"ok":true' "$body"

# 8) GET /api/gateway
code=$(http_code GET "$BASE/api/gateway")
body=$(cat /tmp/mc-test-body.json)
assert "GET /api/gateway status" "200" "$code"

# 9) GET /
code=$(curl -s -o /tmp/mc-test-body.json -w "%{http_code}" "$BASE/")
assert "GET / status" "200" "$code"

# 10) GET /signin
code=$(curl -s -o /tmp/mc-test-body.json -w "%{http_code}" "$BASE/signin")
assert "GET /signin status" "200" "$code"

echo "${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
