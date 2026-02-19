#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3003}"
DB_URL="${DATABASE_URL:-postgresql://openclaw@/mission_control?host=/var/run/postgresql}"
API_SECRET_VALUE="${API_SECRET:-$(grep API_SECRET /home/openclaw/projects/openclaw-mission-control/.env.local | cut -d= -f2)}"

pass=0
fail=0

assert_eq() { local n="$1" e="$2" a="$3"; if [[ "$e" == "$a" ]]; then echo "✅ $n"; pass=$((pass+1)); else echo "❌ $n (expected '$e', got '$a')"; fail=$((fail+1)); fi; }
assert_contains() { local n="$1" v="$2" needle="$3"; if [[ "$v" == *"$needle"* ]]; then echo "✅ $n"; pass=$((pass+1)); else echo "❌ $n (missing '$needle')"; fail=$((fail+1)); fi; }

http_json() {
  local method="$1" url="$2" tenant_id="$3" body="${4:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /tmp/mc-settings-body.json -w "%{http_code}" -X "$method" "$url" -H "Authorization: Bearer ${API_SECRET_VALUE}" -H "x-tenant-id: ${tenant_id}" -H "content-type: application/json" -d "$body"
  else
    curl -sS -o /tmp/mc-settings-body.json -w "%{http_code}" -X "$method" "$url" -H "Authorization: Bearer ${API_SECRET_VALUE}" -H "x-tenant-id: ${tenant_id}"
  fi
}

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS tenant_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO tenants (id, slug, name, plan) VALUES (2, 'tenant-2', 'Tenant 2', 'free') ON CONFLICT (id) DO NOTHING;
DELETE FROM tenant_settings WHERE tenant_id IN (1,2);
SQL

payload='{"settings":{"anthropicKey":"sk-ant-aaa","openaiKey":"sk-proj-bbb","models":{"mainAgent":"claude-sonnet-4-5"}}}'
code=$(http_json POST "$BASE_URL/api/settings" 1 "$payload")
body=$(cat /tmp/mc-settings-body.json)
assert_eq "POST /api/settings status" "200" "$code"
assert_contains "POST /api/settings includes anthropic key" "$body" '"anthropicKey":"sk-ant-aaa"'

code=$(http_json GET "$BASE_URL/api/settings" 1)
body=$(cat /tmp/mc-settings-body.json)
assert_eq "GET /api/settings tenant 1 status" "200" "$code"
assert_contains "GET /api/settings returns tenant 1 key" "$body" '"openaiKey":"sk-proj-bbb"'

payload2='{"settings":{"anthropicKey":"sk-ant-tenant-2"}}'
code=$(http_json POST "$BASE_URL/api/settings" 2 "$payload2")
assert_eq "POST /api/settings tenant 2 status" "200" "$code"

code=$(http_json GET "$BASE_URL/api/settings" 2)
body=$(cat /tmp/mc-settings-body.json)
assert_eq "GET /api/settings tenant 2 status" "200" "$code"
assert_contains "tenant 2 sees only its own key" "$body" '"anthropicKey":"sk-ant-tenant-2"'

code=$(http_json GET "$BASE_URL/api/settings" 1)
body=$(cat /tmp/mc-settings-body.json)
assert_contains "tenant 1 key unchanged" "$body" '"anthropicKey":"sk-ant-aaa"'
if [[ "$body" == *"sk-ant-tenant-2"* ]]; then
  echo "❌ cross-tenant isolation failed"; fail=$((fail+1))
else
  echo "✅ cross-tenant isolation works"; pass=$((pass+1))
fi

echo "${pass} passed, ${fail} failed"
[[ "$fail" -eq 0 ]]
