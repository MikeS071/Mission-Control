#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3003}"
ENV_FILE="/home/openclaw/projects/openclaw-mission-control/.env.local"
API_SECRET="$(grep '^API_SECRET=' "$ENV_FILE" | cut -d= -f2)"
AUTH_HEADER="Authorization: Bearer ${API_SECRET}"

fail() {
  echo "❌ $1"
  exit 1
}

pass() {
  echo "✅ $1"
}

create_one="$(curl -sS -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"title":"Overhaul Goal A","description":"First goal","status":"todo"}' "$BASE_URL/api/tasks")"

echo "$create_one" | grep -Eq '"goalId":"G[0-9]{3,}"' || fail "POST /api/tasks missing goalId format"
pass "POST /api/tasks creates task with goalId format"

id_one="$(node -e "const data=JSON.parse(process.argv[1]); process.stdout.write(String(data.id||''));" "$create_one")"
goal_one="$(node -e "const data=JSON.parse(process.argv[1]); process.stdout.write(String(data.goalId||''));" "$create_one")"
[ -n "$id_one" ] || fail "created task missing id"

create_two="$(curl -sS -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"title":"Overhaul Goal B","description":"Second goal","status":"todo"}' "$BASE_URL/api/tasks")"
goal_two="$(node -e "const data=JSON.parse(process.argv[1]); process.stdout.write(String(data.goalId||''));" "$create_two")"

node -e "const a=Number((process.argv[1]||'').replace(/^G/,'')); const b=Number((process.argv[2]||'').replace(/^G/,'')); if(!(Number.isFinite(a)&&Number.isFinite(b)&&b===a+1)){process.exit(1)}" "$goal_one" "$goal_two" || fail "goalId did not increment per tenant"
pass "goalId increments correctly per tenant"

patch_payload='{"checklist":[{"id":"manual-1","text":"Write migration","checked":false},{"id":"manual-2","text":"Ship UI","checked":true}]}'
patched="$(curl -sS -X PATCH -H "$AUTH_HEADER" -H 'Content-Type: application/json' -d "$patch_payload" "$BASE_URL/api/tasks/$id_one")"

echo "$patched" | grep -q '"checklist":' || fail "PATCH /api/tasks/:id missing checklist"
pass "PATCH /api/tasks/:id updates checklist"

node -e "const data=JSON.parse(process.argv[1]); if(!Array.isArray(data.checklist)) process.exit(1); for (const i of data.checklist){ if(typeof i.id!=='string'||typeof i.text!=='string'||typeof i.checked!=='boolean') process.exit(1);} " "$patched" || fail "Checklist JSON invalid after save"
pass "Checklist JSON is valid after save"

echo "🎉 Kanban overhaul API tests passed"
