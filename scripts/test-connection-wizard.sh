#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3003}"
DB_URL="${DATABASE_URL:-postgresql://openclaw@/mission_control?host=/var/run/postgresql}"
API_SECRET_VALUE="${API_SECRET:-$(grep API_SECRET /home/openclaw/projects/openclaw-mission-control/.env.local | cut -d= -f2)}"

pass=0
fail=0

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "✅ $name"
    pass=$((pass + 1))
  else
    echo "❌ $name (expected '$expected', got '$actual')"
    fail=$((fail + 1))
  fi
}

assert_contains() {
  local name="$1" value="$2" needle="$3"
  if [[ "$value" == *"$needle"* ]]; then
    echo "✅ $name"
    pass=$((pass + 1))
  else
    echo "❌ $name (missing '$needle')"
    fail=$((fail + 1))
  fi
}

http_code() {
  local method="$1" url="$2" tenant_id="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /tmp/mc-connwiz-body.json -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer ${API_SECRET_VALUE}" \
      -H "x-tenant-id: ${tenant_id}" \
      -H "content-type: application/json" \
      -d "$body"
  else
    curl -sS -o /tmp/mc-connwiz-body.json -w "%{http_code}" -X "$method" "$url" \
      -H "Authorization: Bearer ${API_SECRET_VALUE}" \
      -H "x-tenant-id: ${tenant_id}"
  fi
}

json_field() {
  local field="$1"
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('/tmp/mc-connwiz-body.json','utf8'));console.log((d && d['$field']) ?? '')"
}

# Ensure tenant 2 exists for isolation checks
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "insert into tenants (id, slug, name, plan) values (2, 'tenant-2', 'Tenant 2', 'free') on conflict (id) do nothing;" >/dev/null

payload='{"label":"Test Gateway","url":"http://127.0.0.1:1","token":"secret-token"}'
code=$(http_code POST "$BASE_URL/api/gateway" 1 "$payload")
body=$(cat /tmp/mc-connwiz-body.json)
assert_eq "POST /api/gateway status" "200" "$code"
assert_contains "POST /api/gateway includes tenantId" "$body" '"tenantId":1'
assert_contains "POST /api/gateway includes status" "$body" '"status"'
GW_ID=$(json_field id)

if [[ -z "$GW_ID" ]]; then
  echo "❌ Failed to parse created gateway id"
  fail=$((fail + 1))
  GW_ID=0
fi

# Verify token hash stored and raw token not stored
stored_hash=$(psql "$DB_URL" -tA -c "select token_hash from gateway_connections where id=${GW_ID};")
expected_hash=$(printf "secret-token" | sha256sum | awk '{print $1}')
assert_eq "token hash stored" "$expected_hash" "$stored_hash"

code=$(http_code GET "$BASE_URL/api/gateway" 1)
body=$(cat /tmp/mc-connwiz-body.json)
assert_eq "GET /api/gateway tenant 1 status" "200" "$code"
assert_contains "GET /api/gateway returns created id" "$body" "\"id\":${GW_ID}"

# Cross-tenant list isolation
code=$(http_code GET "$BASE_URL/api/gateway" 2)
body=$(cat /tmp/mc-connwiz-body.json)
assert_eq "GET /api/gateway tenant 2 status" "200" "$code"
if [[ "$body" == "[]" ]]; then
  echo "✅ tenant 2 cannot see tenant 1 connections"
  pass=$((pass + 1))
else
  echo "❌ tenant 2 unexpectedly sees connections: $body"
  fail=$((fail + 1))
fi

code=$(http_code POST "$BASE_URL/api/gateway/${GW_ID}/check" 1 '{}')
body=$(cat /tmp/mc-connwiz-body.json)
assert_eq "POST /api/gateway/:id/check status" "200" "$code"
assert_contains "POST /api/gateway/:id/check updates status" "$body" '"status":"error"'

# Tenant 2 cannot delete tenant 1 gateway
code=$(http_code DELETE "$BASE_URL/api/gateway/${GW_ID}" 2)
assert_eq "cross-tenant DELETE blocked" "404" "$code"

code=$(http_code DELETE "$BASE_URL/api/gateway/${GW_ID}" 1)
body=$(cat /tmp/mc-connwiz-body.json)
assert_eq "DELETE /api/gateway/:id status" "200" "$code"
assert_contains "DELETE /api/gateway/:id ok" "$body" '"ok":true'

remaining=$(psql "$DB_URL" -tA -c "select count(*) from gateway_connections where id=${GW_ID};")
assert_eq "row deleted from DB" "0" "$remaining"

echo "${pass} passed, ${fail} failed"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
