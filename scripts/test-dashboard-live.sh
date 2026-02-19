#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:3003}"
API_SECRET_VALUE="${API_SECRET:-$(grep API_SECRET .env.local | cut -d= -f2 || true)}"

if [[ -z "${API_SECRET_VALUE}" ]]; then
  echo "API_SECRET is required (env or .env.local)"
  exit 1
fi

AUTH=(-H "Authorization: Bearer ${API_SECRET_VALUE}")
PASS=0
FAIL=0

assert_ok() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd"; then
    echo "✅ ${name}"; PASS=$((PASS+1))
  else
    echo "❌ ${name}"; FAIL=$((FAIL+1))
  fi
}

get_json() {
  local url="$1"
  curl -fsS "${AUTH[@]}" "$url"
}

summary_before=$(get_json "$BASE/api/stats/summary")
agents_json=$(get_json "$BASE/api/agents/active")

assert_ok "GET /api/stats/summary returns expected shape" "python3 - <<'PY'
import json
obj=json.loads('''$summary_before''')
keys={'pctComplete','activeAgents','totalCostUsd','tasksDoneToday','totalTasks','doneTasks'}
assert keys.issubset(obj.keys())
assert isinstance(obj['pctComplete'], int)
assert isinstance(obj['activeAgents'], int)
assert isinstance(obj['totalTasks'], int)
assert isinstance(obj['doneTasks'], int)
print('ok')
PY"

assert_ok "GET /api/agents/active returns array" "python3 - <<'PY'
import json
obj=json.loads('''$agents_json''')
assert isinstance(obj, list)
print('ok')
PY"

DATABASE_URL_VALUE="${DATABASE_URL:-$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- || true)}"
if [[ -z "${DATABASE_URL_VALUE}" ]]; then
  echo "DATABASE_URL is required (env or .env.local)"
  exit 1
fi

created_id=$(DATABASE_URL="${DATABASE_URL_VALUE}" node - <<'NODE'
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(
    `INSERT INTO tasks (tenant_id, title, description, status, priority, goal, tags, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id`,
    [1, 'Dashboard Live Test Task', 'test for summary', 'done', 'Medium', 'Goal 1', '']
  );
  console.log(String(res.rows[0].id));
  await client.end();
})();
NODE
)

summary_after=$(get_json "$BASE/api/stats/summary")

assert_ok "Stats reflect DB data after inserting done task" "python3 - <<'PY'
import json
before=json.loads('''$summary_before''')
after=json.loads('''$summary_after''')
assert after['totalTasks'] == before['totalTasks'] + 1
assert after['doneTasks'] == before['doneTasks'] + 1
expected = round((after['doneTasks']/after['totalTasks'])*100) if after['totalTasks'] else 0
assert after['pctComplete'] == expected
print('ok')
PY"

DATABASE_URL="${DATABASE_URL_VALUE}" CREATED_ID="${created_id}" node - <<'NODE'
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('DELETE FROM tasks WHERE id = $1', [Number(process.env.CREATED_ID)]);
  await client.end();
})();
NODE

echo "${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
