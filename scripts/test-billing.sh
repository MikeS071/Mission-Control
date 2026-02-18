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

status_json="$(curl -sS -H "$AUTH_HEADER" "$BASE_URL/api/billing/status")"
echo "$status_json" | grep -q '"plan"' || fail "status response missing plan"
echo "$status_json" | grep -q '"status"' || fail "status response missing status"
pass "GET /api/billing/status returns plan and status"

pro_json="$(curl -sS -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"plan":"pro"}' "$BASE_URL/api/billing/checkout")"
echo "$pro_json" | grep -q '"url"' || fail "pro checkout missing url"
pass "POST /api/billing/checkout plan=pro returns url"

team_low_code="$(curl -sS -o /tmp/billing_team_low.json -w '%{http_code}' -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"plan":"team","seats":5}' "$BASE_URL/api/billing/checkout")"
[ "$team_low_code" = "400" ] || fail "team seats=5 should return 400"
pass "POST /api/billing/checkout plan=team seats=5 is rejected"

team_ok_code="$(curl -sS -o /tmp/billing_team_ok.json -w '%{http_code}' -X POST -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"plan":"team","seats":10}' "$BASE_URL/api/billing/checkout")"
[ "$team_ok_code" = "200" ] || fail "team seats=10 should return 200"
grep -q '"url"' /tmp/billing_team_ok.json || fail "team seats=10 missing url"
pass "POST /api/billing/checkout plan=team seats=10 accepted"

webhook_code="$(curl -sS -o /tmp/billing_webhook.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"type":"checkout.session.completed","data":{"object":{"metadata":{"tenantId":"1","plan":"pro"},"customer":"cus_mock","subscription":"sub_mock"}}}' "$BASE_URL/api/billing/webhook")"
[ "$webhook_code" = "200" ] || fail "webhook should return 200 for valid payload shape"
pass "POST /api/billing/webhook exists and returns 200"

echo "🎉 Billing API tests passed"
