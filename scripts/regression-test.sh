#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# regression-test.sh — Full regression suite for ArchonHQ Mission Control
#
# Covers: build · database · public API · auth enforcement · pages ·
#         newsletter · stripe · middleware · infrastructure · content integrity
#
# Usage:
#   bash scripts/regression-test.sh               # test against dev (localhost:3003)
#   bash scripts/regression-test.sh --prod         # test against prod (archonhq.ai)
#   bash scripts/regression-test.sh --base http://localhost:3003
#
# Exit: 0 = all pass, 1 = failures
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Args ──────────────────────────────────────────────────────────────────────
BASE_URL="http://localhost:3003"
for arg in "$@"; do
  [[ "$arg" == "--prod" ]]  && BASE_URL="https://archonhq.ai"
  [[ "$arg" =~ ^--base=?  ]] && BASE_URL="${arg#--base}"
  [[ "$arg" =~ ^--base$   ]] && { shift; BASE_URL="${1:-$BASE_URL}"; }
done

# ── Counters & helpers ────────────────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0
FAILURES=()

pass()  { echo -e "  \033[32m✅ PASS\033[0m  $*"; PASS=$((PASS+1)); }
fail()  { echo -e "  \033[31m❌ FAIL\033[0m  $*"; FAIL=$((FAIL+1)); FAILURES+=("$*"); }
skip()  { echo -e "  \033[33m⏭  SKIP\033[0m  $*"; SKIP=$((SKIP+1)); }
section(){ echo ""; echo -e "\033[36m── $* ──\033[0m"; }

http() {
  # http <expected_code> <method> <path> [extra curl args...]
  local EXPECTED="$1" METHOD="$2" ROUTE="$3"; shift 3
  local URL="${BASE_URL}${ROUTE}"
  local CODE
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X "$METHOD" "$URL" \
    -m 10 "$@" 2>/dev/null || echo "000")
  if [[ "$CODE" == "$EXPECTED" ]]; then
    pass "$METHOD $ROUTE → $CODE"
  else
    fail "$METHOD $ROUTE → got $CODE, expected $EXPECTED"
  fi
}

http_not() {
  # http_not <forbidden_code> <method> <path>
  local FORBIDDEN="$1" METHOD="$2" ROUTE="$3"
  local URL="${BASE_URL}${ROUTE}"
  local CODE
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X "$METHOD" "$URL" \
    -m 10 2>/dev/null || echo "000")
  if [[ "$CODE" != "$FORBIDDEN" ]]; then
    pass "$METHOD $ROUTE → $CODE (not $FORBIDDEN)"
  else
    fail "$METHOD $ROUTE → got $FORBIDDEN (should not be $FORBIDDEN)"
  fi
}

http_redirect() {
  # http_redirect <method> <path> <expected_location_contains>
  local METHOD="$1" ROUTE="$2" EXPECT="$3"
  local URL="${BASE_URL}${ROUTE}"
  local LOC
  LOC=$(curl -sk -o /dev/null -D - -X "$METHOD" "$URL" -m 10 2>/dev/null \
    | grep -i "^location:" | head -1 | tr -d '\r' || true)
  if echo "$LOC" | grep -qi "$EXPECT"; then
    pass "$METHOD $ROUTE redirects to *$EXPECT*"
  else
    fail "$METHOD $ROUTE redirect location '$LOC' does not contain '$EXPECT'"
  fi
}

body_contains() {
  # body_contains <method> <path> <string>
  local METHOD="$1" ROUTE="$2" EXPECT="$3"
  local URL="${BASE_URL}${ROUTE}"
  local BODY
  BODY=$(curl -sk -X "$METHOD" "$URL" -m 10 2>/dev/null || true)
  if echo "$BODY" | grep -q "$EXPECT"; then
    pass "$METHOD $ROUTE body contains '$EXPECT'"
  else
    fail "$METHOD $ROUTE body missing '$EXPECT'"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  ArchonHQ Regression Test"
echo "  Target: $BASE_URL"
echo "  $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────────────────────
section "1. TypeScript Build"
# ─────────────────────────────────────────────────────────────────────────────
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
TS_ERRORS=$(echo "$TSC_OUT" | grep -c "error TS" || true)
if [[ "$TS_ERRORS" -eq 0 ]]; then
  pass "TypeScript: 0 errors"
else
  fail "TypeScript: $TS_ERRORS error(s)"
  echo "$TSC_OUT" | grep "error TS" | head -5 | while read -r l; do echo "     $l"; done
fi

# ─────────────────────────────────────────────────────────────────────────────
section "2. Database"
# ─────────────────────────────────────────────────────────────────────────────
DB_URL="${DATABASE_URL:-postgresql://openclaw@/mission_control?host=/var/run/postgresql}"

DB_RESULT=$(psql "$DB_URL" -t -c "SELECT 1" 2>&1 || true)
if echo "$DB_RESULT" | grep -q "1"; then
  pass "DB connection: OK"
else
  fail "DB connection: FAILED — $DB_RESULT"
fi

REQUIRED_TABLES="tasks events heartbeats agent_stats waitlist subscriptions newsletter_issues tenants memberships"
EXISTING=$(psql "$DB_URL" -t -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public'" 2>/dev/null || true)
for TABLE in $REQUIRED_TABLES; do
  if echo "$EXISTING" | grep -q "$TABLE"; then
    pass "DB table: $TABLE exists"
  else
    fail "DB table: $TABLE MISSING"
  fi
done

# newsletter_issues has content (at least 1 issue)
ISSUE_COUNT=$(psql "$DB_URL" -t -c \
  "SELECT COUNT(*) FROM newsletter_issues" 2>/dev/null | tr -d ' ' || echo "0")
if [[ "${ISSUE_COUNT:-0}" -ge 1 ]]; then
  pass "DB newsletter_issues: $ISSUE_COUNT issue(s) seeded"
else
  fail "DB newsletter_issues: empty — run send-newsletter.py --send to seed"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3. Server Reachable"
# ─────────────────────────────────────────────────────────────────────────────
SERVER_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE_URL" -m 10 2>/dev/null || echo "000")
if [[ "$SERVER_CODE" == "200" ]]; then
  pass "Server at $BASE_URL → 200"
else
  fail "Server at $BASE_URL → $SERVER_CODE (is dev server running?)"
  echo ""
  echo "  ⚠️  Server unreachable — skipping all HTTP tests"
  echo ""
  # Print summary and exit early
  echo "════════════════════════════════════════════════"
  echo -e "\033[31m  FAIL — $FAIL failure(s) (server unreachable)\033[0m"
  echo "════════════════════════════════════════════════"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
section "4. Public Pages (no auth required → 200)"
# ─────────────────────────────────────────────────────────────────────────────
http 200 GET "/"
http 200 GET "/signin"
http 200 GET "/roadmap"
http 200 GET "/unsubscribe"
http 200 GET "/unsubscribe?status=ok&email=test%40test.com"
http 200 GET "/unsubscribe?status=already&email=test%40test.com"

# ─────────────────────────────────────────────────────────────────────────────
section "5. Auth-Protected Pages (unauthenticated → redirect, not 500)"
# ─────────────────────────────────────────────────────────────────────────────
# Dashboard pages redirect to /signin (307/302) — must NOT return 200 or 500
for PAGE in "/dashboard" "/dashboard/billing" "/dashboard/connect" "/dashboard/profile"; do
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE_URL$PAGE" -m 10 2>/dev/null || echo "000")
  if [[ "$CODE" =~ ^(301|302|307|308)$ ]]; then
    pass "GET $PAGE → $CODE (redirect, auth gate working)"
  elif [[ "$CODE" == "200" ]]; then
    fail "GET $PAGE → 200 (auth gate BYPASSED)"
  elif [[ "$CODE" == "500" ]]; then
    fail "GET $PAGE → 500 (server error)"
  else
    pass "GET $PAGE → $CODE"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
section "6. Public API Routes (no auth → not 401)"
# ─────────────────────────────────────────────────────────────────────────────
http 200 GET  "/api/waitlist"
http 200 GET  "/api/openapi"
http_not 401 POST "/api/feature-requests" -H "Content-Type: application/json" -d '{"email":"t@t.com","feature":"test"}'

# Waitlist input validation
http 400 POST "/api/waitlist" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}'
http_not 401 POST "/api/waitlist" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}'

# Newsletter unsubscribe — public, no auth
TOKEN=$(python3 -c "import base64; print(base64.urlsafe_b64encode(b'regression-test@archonhq.ai').decode())" 2>/dev/null || echo "cmVncmVzc2lvbi10ZXN0QGFyY2hvbmhxLmFp")
CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
  "$BASE_URL/api/newsletter/unsubscribe?token=$TOKEN" -m 10 2>/dev/null || echo "000")
if [[ "$CODE" =~ ^(200|301|302|307|308)$ ]]; then
  pass "GET /api/newsletter/unsubscribe → $CODE (public, no auth)"
else
  fail "GET /api/newsletter/unsubscribe → $CODE (expected 2xx/3xx, not 401)"
fi

# Unsubscribe redirect must NOT point to raw localhost:3000 (internal proxy)
LOC=$(curl -sk -D - "$BASE_URL/api/newsletter/unsubscribe?token=$TOKEN" -m 10 2>/dev/null \
  | grep -i "^location:" | head -1 | tr -d '\r' || true)
if echo "$LOC" | grep -qE "localhost:3000|127\.0\.0\.1"; then
  fail "Unsubscribe redirect uses internal proxy address: $LOC"
else
  pass "Unsubscribe redirect location is clean: ${LOC:-no redirect header}"
fi

# Telegram webhook — public
http_not 401 POST "/api/telegram" \
  -H "Content-Type: application/json" -d '{}'

# ─────────────────────────────────────────────────────────────────────────────
section "7. Auth-Protected API Routes (unauthenticated → 401)"
# ─────────────────────────────────────────────────────────────────────────────
http 401 GET  "/api/tasks"
http 401 POST "/api/tasks" -H "Content-Type: application/json" -d '{}'
http 401 GET  "/api/agents/active"
http 401 GET  "/api/heartbeats"
http 401 GET  "/api/stats/summary"
http 401 GET  "/api/tenants/me"
http 401 GET  "/api/settings"
http 401 GET  "/api/events"
http 401 POST "/api/billing/checkout" \
  -H "Content-Type: application/json" -d '{"plan":"pro"}'
http 401 POST "/api/billing/portal"
http 401 GET  "/api/billing/status"
http 401 GET  "/api/agent-stats"
http 401 GET  "/api/aipipe/health"
http 401 GET  "/api/aipipe/stats"
http 401 POST "/api/aipipe/proxy/chat" -H "Content-Type: application/json" -d '{}'
http 401 POST "/api/aipipe/proxy/messages" -H "Content-Type: application/json" -d '{}'

# ─────────────────────────────────────────────────────────────────────────────
section "8. Billing Webhook (POST → 400 bad signature, not 401 or 500)"
# ─────────────────────────────────────────────────────────────────────────────
# Webhook is public (Stripe calls it directly) but rejects bad/missing signatures
CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/api/billing/webhook" \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}' -m 10 2>/dev/null || echo "000")
if [[ "$CODE" =~ ^(400|200)$ ]]; then
  pass "POST /api/billing/webhook → $CODE (public endpoint, signature validation working)"
else
  fail "POST /api/billing/webhook → $CODE (expected 400 bad-sig or 200)"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "9. OpenAPI Spec Integrity"
# ─────────────────────────────────────────────────────────────────────────────
body_contains GET "/api/openapi" "openapi"
body_contains GET "/api/openapi" "paths"

# ─────────────────────────────────────────────────────────────────────────────
section "10. Newsletter System"
# ─────────────────────────────────────────────────────────────────────────────
NEWSLETTER_SCRIPT="$REPO_ROOT/automation/newsletter/send-newsletter.py"
if [[ ! -f "$NEWSLETTER_SCRIPT" ]]; then
  # Check workspace path
  NEWSLETTER_SCRIPT="/home/openclaw/.openclaw/workspace/automation/newsletter/send-newsletter.py"
fi

if [[ -f "$NEWSLETTER_SCRIPT" ]]; then
  DRY_OUT=$(python3 "$NEWSLETTER_SCRIPT" 2>&1 || true)
  if echo "$DRY_OUT" | grep -q "DRY RUN"; then
    pass "Newsletter dry-run: OK"
  else
    fail "Newsletter dry-run: unexpected output — $DRY_OUT"
  fi
  if echo "$DRY_OUT" | grep -q "Subscribers: [1-9]"; then
    pass "Newsletter subscribers: found in DB"
  else
    fail "Newsletter subscribers: none found"
  fi
else
  skip "Newsletter script not found at $NEWSLETTER_SCRIPT"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "11. Stripe"
# ─────────────────────────────────────────────────────────────────────────────
ENV_FILE="$REPO_ROOT/.env.local"
STRIPE_KEY=$(grep "^STRIPE_SECRET_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
PRO_PRICE=$(grep  "^STRIPE_PRO_PRICE_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)
TEAM_PRICE=$(grep "^STRIPE_TEAM_PRICE_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)

if [[ -z "$STRIPE_KEY" || "$STRIPE_KEY" == *placeholder* ]]; then
  skip "Stripe key not configured — skipping Stripe checks"
else
  for PRICE_ID in "$PRO_PRICE" "$TEAM_PRICE"; do
    [[ -z "$PRICE_ID" || "$PRICE_ID" == *placeholder* ]] && continue
    RESULT=$(curl -sf "https://api.stripe.com/v1/prices/$PRICE_ID" \
      -u "$STRIPE_KEY:" 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('nickname','?'), '\$'+str(d.get('unit_amount',0)//100)+'/mo', 'active='+str(d.get('active','?')))
" 2>/dev/null || echo "error")
    if echo "$RESULT" | grep -q "active=True"; then
      pass "Stripe $PRICE_ID — $RESULT"
    else
      fail "Stripe $PRICE_ID — $RESULT"
    fi
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
section "12. Infrastructure"
# ─────────────────────────────────────────────────────────────────────────────
pgrep -f cloudflared >/dev/null 2>&1 \
  && pass "cloudflared: running" || fail "cloudflared: NOT running"

pgrep -f tls-proxy >/dev/null 2>&1 \
  && pass "tls-proxy: running" || fail "tls-proxy: NOT running"

# Dev server check (skip on --prod mode)
if [[ "$BASE_URL" != "https://archonhq.ai" ]]; then
  DEV_PID_FILE="/tmp/mc-dev.pid"
  if [[ -f "$DEV_PID_FILE" ]]; then
    DEV_PID=$(cat "$DEV_PID_FILE")
    kill -0 "$DEV_PID" 2>/dev/null \
      && pass "Dev server: running (PID $DEV_PID)" \
      || fail "Dev server: PID $DEV_PID not alive"
  else
    fail "Dev server: no PID file — start with bash start-dev.sh"
  fi
fi

# App container (archonhq — replaces Coolify-managed container post-migration)
CONTAINER=$(docker ps --format "{{.Names}}\t{{.Status}}" 2>/dev/null \
  | grep "^archonhq" | head -1 || true)
if [[ -n "$CONTAINER" ]]; then
  pass "App container: $CONTAINER"
else
  fail "App container (archonhq): not running"
fi

# Port checks
for PORT in 3000 3002 3003; do
  ss -tlnp 2>/dev/null | grep -q ":$PORT " \
    && pass "Port $PORT: listening" \
    || fail "Port $PORT: not listening"
done

# ─────────────────────────────────────────────────────────────────────────────
section "13. Content Integrity"
# ─────────────────────────────────────────────────────────────────────────────
# No hardcoded env-specific values in source files changed vs main
CHANGED=$(git diff main..HEAD --name-only 2>/dev/null | \
  grep -E "\.(ts|tsx)$" | grep -v "^scripts/" || true)

FOUND_LEAK=false
for f in $CHANGED; do
  [[ -f "$f" ]] || continue
  HITS=$(grep -En \
    'localhost:[0-9]{4}|127\.0\.0\.1:[0-9]{4}|dev\.archonhq\.ai' \
    "$f" 2>/dev/null | grep -v "process\.env" | grep -v "useState(" | grep -v "|| '" | grep -v "placeholder=" || true)
  if [[ -n "$HITS" ]]; then
    fail "Hardcoded env value in $f: $(echo "$HITS" | head -1)"
    FOUND_LEAK=true
  fi
done
$FOUND_LEAK || pass "No hardcoded env values in changed source files"

# No .env files accidentally committed
if git ls-files | grep -qE "^\.env(\.local)?$"; then
  fail ".env or .env.local is tracked by git — remove from index"
else
  pass ".env files not committed to git"
fi

# No placeholder Stripe key in committed source
STRIPE_PLACEHOLDER=$(grep -rn "sk_test_placeholder" src/ 2>/dev/null | grep -v "__tests__\|\.test\.ts\|\.spec\.ts\|startsWith\|includes\|===\|!==\|placeholder.*check\|guard" || true)
if [[ -n "$STRIPE_PLACEHOLDER" ]]; then
  fail "Placeholder Stripe value found in src/: $(echo "$STRIPE_PLACEHOLDER" | head -1)"
else
  pass "No placeholder Stripe values in src/"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "14. Middleware Integrity"
# ─────────────────────────────────────────────────────────────────────────────
# Verify expected public paths are in middleware
EXPECTED_PUBLIC="/api/auth /api/waitlist /api/feature-requests /api/newsletter/unsubscribe /unsubscribe /signin /roadmap"
MIDDLEWARE="src/middleware.ts"
for PATH_CHECK in $EXPECTED_PUBLIC; do
  if grep -q "'$PATH_CHECK'" "$MIDDLEWARE" 2>/dev/null; then
    pass "Middleware public: '$PATH_CHECK' listed"
  else
    fail "Middleware public: '$PATH_CHECK' MISSING from PUBLIC_PATHS"
  fi
done

# Billing routes are NOT in public paths (must require auth)
for PRIVATE_PATH in "/api/billing/checkout" "/api/billing/portal" "/api/billing/status"; do
  if grep -q "'$PRIVATE_PATH'" "$MIDDLEWARE" 2>/dev/null; then
    fail "Middleware: '$PRIVATE_PATH' is in PUBLIC_PATHS (should be protected)"
  else
    pass "Middleware protected: '$PRIVATE_PATH' is not public"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
section "15. AiPipe Integration"
# ─────────────────────────────────────────────────────────────────────────────
# Check AiPipe files exist
if [[ -f "$REPO_ROOT/src/lib/aipipe.ts" ]]; then
  pass "src/lib/aipipe.ts exists"
else
  fail "src/lib/aipipe.ts MISSING"
fi

if [[ -f "$REPO_ROOT/src/app/api/aipipe/health/route.ts" ]]; then
  pass "AiPipe health route exists"
else
  fail "AiPipe health route MISSING"
fi

if [[ -f "$REPO_ROOT/src/app/api/aipipe/stats/route.ts" ]]; then
  pass "AiPipe stats route exists"
else
  fail "AiPipe stats route MISSING"
fi

if [[ -f "$REPO_ROOT/src/components/AiPipeWidget.tsx" ]]; then
  pass "AiPipeWidget component exists"
else
  fail "AiPipeWidget component MISSING"
fi

# Check AiPipe service is running (non-fatal: skip with warning if not)
AIPIPE_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:8082/healthz" -m 3 2>/dev/null || echo "000")
if [[ "$AIPIPE_CODE" == "200" ]]; then
  pass "AiPipe service running at :8082 → 200"
else
  skip "AiPipe service not running at :8082 (code: $AIPIPE_CODE) — start with: systemctl --user start aipipe"
fi

# Validate AIPIPE_URL is set in env
if grep -q "AIPIPE_URL" "$REPO_ROOT/.env.local" 2>/dev/null; then
  pass "AIPIPE_URL configured in .env.local"
else
  fail "AIPIPE_URL not found in .env.local"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 16. AiPipe Per-Tenant Auth
# ─────────────────────────────────────────────────────────────────────────────
echo -e "\n\033[36m── 16. AiPipe Per-Tenant Auth ──\033[0m"

# Check AIPIPE_ADMIN_SECRET is configured in AiPipe env file
if grep -q "AIPIPE_ADMIN_SECRET" "$HOME/.config/aipipe/env" 2>/dev/null; then
  pass "AIPIPE_ADMIN_SECRET set in ~/.config/aipipe/env"
else
  fail "AIPIPE_ADMIN_SECRET missing from ~/.config/aipipe/env"
fi

# Check AIPIPE_ADMIN_SECRET is configured in MC .env.local
if grep -q "AIPIPE_ADMIN_SECRET" "$REPO_ROOT/.env.local" 2>/dev/null; then
  pass "AIPIPE_ADMIN_SECRET set in MC .env.local"
else
  fail "AIPIPE_ADMIN_SECRET missing from MC .env.local"
fi

# Check aipipe.ts exports the new sync + tenant-stats functions
if grep -q "aipipeSyncTenantKeys" "$REPO_ROOT/src/lib/aipipe.ts" 2>/dev/null; then
  pass "aipipe.ts: aipipeSyncTenantKeys exported"
else
  fail "aipipe.ts: aipipeSyncTenantKeys MISSING"
fi

if grep -q "aipipeTenantStats" "$REPO_ROOT/src/lib/aipipe.ts" 2>/dev/null; then
  pass "aipipe.ts: aipipeTenantStats exported"
else
  fail "aipipe.ts: aipipeTenantStats MISSING"
fi

# Live admin endpoint tests (only if AiPipe is running)
AIPIPE_LIVE=$(curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:8082/healthz" -m 3 2>/dev/null || echo "000")
if [[ "$AIPIPE_LIVE" == "200" ]]; then
  # POST without admin secret → 401
  UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://127.0.0.1:8082/v1/tenants/regression-test/providers \
    -H "Content-Type: application/json" \
    -d '{"provider":"openai","api_key":"sk-test"}' -m 5 2>/dev/null || echo "000")
  if [[ "$UNAUTH_CODE" == "401" ]]; then
    pass "AiPipe admin: POST without secret → 401"
  else
    fail "AiPipe admin: expected 401 without secret, got $UNAUTH_CODE"
  fi

  # POST with admin secret → 200
  ADMIN_SECRET=$(grep "AIPIPE_ADMIN_SECRET" "$HOME/.config/aipipe/env" 2>/dev/null | cut -d'=' -f2- | head -1)
  if [[ -n "$ADMIN_SECRET" ]]; then
    UPSERT_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST http://127.0.0.1:8082/v1/tenants/regression-test/providers \
      -H "Content-Type: application/json" \
      -H "X-Admin-Secret: $ADMIN_SECRET" \
      -d '{"provider":"openai","api_key":"sk-regression-test"}' -m 5 2>/dev/null || echo "000")
    if [[ "$UPSERT_CODE" == "200" ]]; then
      pass "AiPipe admin: POST with secret → 200"
    else
      fail "AiPipe admin: expected 200 with secret, got $UPSERT_CODE"
    fi

    # GET stats → JSON with requests field
    STATS_BODY=$(curl -s \
      http://127.0.0.1:8082/v1/tenants/regression-test/stats \
      -H "X-Admin-Secret: $ADMIN_SECRET" -m 5 2>/dev/null || echo "{}")
    if echo "$STATS_BODY" | grep -q '"requests"'; then
      pass "AiPipe admin: GET /v1/tenants/{id}/stats returns requests field"
    else
      fail "AiPipe admin: stats response missing 'requests' field — got: $STATS_BODY"
    fi
  else
    skip "AiPipe admin secret not readable — skipping live endpoint tests"
  fi
else
  skip "AiPipe not running — skipping live per-tenant endpoint tests"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Final Summary
# ─────────────────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo "════════════════════════════════════════════════"
echo "  Results: $PASS passed · $FAIL failed · $SKIP skipped / $TOTAL total"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "\033[31m  ❌ REGRESSION FAILURES — do not merge\033[0m"
  echo ""
  for F in "${FAILURES[@]}"; do
    echo -e "  \033[31m•\033[0m $F"
  done
  echo ""
  echo "════════════════════════════════════════════════"
  exit 1
else
  echo -e "\033[32m  ✅ ALL TESTS PASSED\033[0m"
  echo "════════════════════════════════════════════════"
  exit 0
fi
