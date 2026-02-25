#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pre-release-check.sh — Run before EVERY dev → main merge
#
# Usage:
#   bash scripts/pre-release-check.sh
# #
# Exit codes: 0 = all clear, 1 = failures found
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Clean stale Next-generated TS types (these can reference removed route files and fail tsc).
# Safe to run even when dev server is up; avoids nuking full .next by default.
rm -rf .next/types .next/dev/types 2>/dev/null || true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"


PASS=0
FAIL=0
WARN=0

green()  { echo -e "\033[32m✅ $*\033[0m"; }
red()    { echo -e "\033[31m❌ $*\033[0m"; FAIL=$((FAIL+1)); }
yellow() { echo -e "\033[33m⚠️  $*\033[0m"; WARN=$((WARN+1)); }
info()   { echo -e "\033[36m   $*\033[0m"; }

echo ""
echo "════════════════════════════════════════"
echo "  ArchonHQ Pre-Release Check"
echo "  $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "════════════════════════════════════════"
echo ""


# ── 0. Regression test suite (mandatory first gate) ──────────────────────────
echo "── 0. Regression Suite"
MC_TEST_BASE_URL="${MC_TEST_BASE_URL:-http://localhost:3002}"
MC_REGRESSION_PROFILE="${MC_REGRESSION_PROFILE:-full}"
REGR_JSON=$(mktemp)
set +e
REGR_OUT=$(bash "$REPO_ROOT/scripts/regression-test.sh" --base "$MC_TEST_BASE_URL" --profile "$MC_REGRESSION_PROFILE" --json-out "$REGR_JSON" 2>&1)
REGR_EXIT=$?
set -e
REGR_SUMMARY=$(python3 - "$REGR_JSON" <<'PY'
import json,sys
p=sys.argv[1]
try:
  d=json.load(open(p))
  print("{} passed · {} failed · {} skipped / {} total (profile={})".format(
    d.get('pass',0), d.get('fail',0), d.get('skip',0), d.get('total',0), d.get('profile','')
  ))
except Exception:
  print("(no JSON summary)")
PY
)
if [[ "$REGR_EXIT" -eq 0 ]]; then
  green "Regression suite passed — $REGR_SUMMARY"
else
  echo ""
  echo "$REGR_OUT" | tail -30
  red "Regression suite FAILED — $REGR_SUMMARY"
  echo ""
  echo "════════════════════════════════════════"
  echo -e "\033[31m  FAIL — fix regression failures before merging.\033[0m"
  echo "════════════════════════════════════════"
  exit 1
fi

# ── 1. Git branch check ───────────────────────────────────────────────────────
echo "── 1. Git"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" == "dev" ]]; then
  green "On dev branch"
elif [[ "$BRANCH" == "main" ]]; then
  green "On main branch (merge flow — OK)"
else
  red "On unexpected branch: $BRANCH (expected dev or main)"
fi

UNPUSHED=$(git log origin/dev..dev --oneline 2>/dev/null | wc -l | tr -d ' ' || echo 0)
if [[ "$UNPUSHED" -gt 0 && "$BRANCH" == "dev" ]]; then
  red "Unpushed commits on dev: $UNPUSHED. Push before merging."
else
  green "dev is in sync with origin/dev"
fi

echo ""

# ── 2. No env-specific config baked into changed files ───────────────────────
echo "── 2. Changed files — env-specific config scan"
CHANGED=$(git diff main..dev --name-only 2>/dev/null)
FOUND_ENV_LEAK=false
ENV_PATTERNS='localhost:[0-9]\{4\}\|127\.0\.0\.1:[0-9]\{4\}\|dev\.archonhq\.ai\|NEXTAUTH_URL\s*=\|DATABASE_URL\s*='

for f in $CHANGED; do
  [[ -f "$f" ]] || continue
  # skip scripts, config, env files themselves
  [[ "$f" == scripts/* || "$f" == .env* || "$f" == *.sh || "$f" == *.md ]] && continue
  HITS=$(grep -En "$ENV_PATTERNS" "$f" 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    # Allow the one known safe fallback in checkout/route.ts
    REAL_HITS=$(echo "$HITS" | grep -v "process\.env\.NEXTAUTH_URL || " || true)
    if [[ -n "$REAL_HITS" ]]; then
      red "Env-specific value found in $f:"
      echo "$REAL_HITS" | head -5 | while read -r line; do info "$line"; done
      FOUND_ENV_LEAK=true
    fi
  fi
done
$FOUND_ENV_LEAK || green "No env-specific config baked into source files"

echo ""

# ── 3. TypeScript build ───────────────────────────────────────────────────────
echo "── 3. TypeScript"
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
TS_ERRORS=$(echo "$TSC_OUT" | grep -c "error TS" || true)
if [[ "$TS_ERRORS" -gt 0 ]]; then
  red "TypeScript errors: $TS_ERRORS"
  echo "$TSC_OUT" | grep "error TS" | head -5 | while read -r line; do info "$line"; done
else
  green "TypeScript: 0 errors"
fi

echo ""

# ── 4. Deployment env audit (Coolify decommissioned) ─────────────────────────
echo "── 4. Deployment env"

yellow "Coolify is decommissioned — skipping Coolify env API checks."

echo ""

# ── 5. Stripe price IDs — verify active in Stripe ────────────────────────────
echo "── 5. Stripe prices"

STRIPE_KEY=$(grep "^STRIPE_SECRET_KEY=" .env.local 2>/dev/null | cut -d= -f2 || true)
PRO_PRICE=$(grep "^STRIPE_PRO_PRICE_ID=" .env.local 2>/dev/null | cut -d= -f2 || true)
TEAM_PRICE=$(grep "^STRIPE_TEAM_PRICE_ID=" .env.local 2>/dev/null | cut -d= -f2 || true)

if [[ -z "$STRIPE_KEY" || "$STRIPE_KEY" == *placeholder* ]]; then
  yellow "No real Stripe key in .env.local — skipping Stripe check"
else
  for PRICE_ID in "$PRO_PRICE" "$TEAM_PRICE"; do
    [[ -z "$PRICE_ID" || "$PRICE_ID" == *placeholder* ]] && continue
    RESULT=$(curl -sf "https://api.stripe.com/v1/prices/$PRICE_ID" -u "$STRIPE_KEY:" 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('nickname','?'), '\$'+str(d.get('unit_amount',0)//100)+'/mo', 'active='+str(d.get('active')))
" 2>/dev/null || echo "error")
    if [[ "$RESULT" == *"active=True"* ]]; then
      green "Stripe $PRICE_ID — $RESULT"
    else
      red "Stripe price $PRICE_ID — $RESULT"
    fi
  done
fi

echo ""

# ── 6. Prod health check ──────────────────────────────────────────────────────
echo "── 6. Prod health"
PROD_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://archonhq.ai 2>/dev/null || echo "000")
if [[ "$PROD_CODE" == "200" ]]; then
  green "https://archonhq.ai → $PROD_CODE"
else
  red "https://archonhq.ai → $PROD_CODE"
fi

# dev.archonhq.ai removed — Coolify decommissioned 2026-02-22; single prod environment via Docker + Traefik
yellow "https://dev.archonhq.ai — skipped (Coolify decommissioned; no separate dev URL)"

echo ""

# ── 7. CF Tunnel & proxy running ─────────────────────────────────────────────
echo "── 7. Infrastructure"
pgrep -f cloudflared >/dev/null 2>&1 && green "cloudflared running" || red "cloudflared NOT running"
pgrep -f tls-proxy    >/dev/null 2>&1 && green "tls-proxy running"  || red "tls-proxy NOT running"

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
if [[ "$FAIL" -gt 0 ]]; then
  echo -e "\033[31m  FAIL — $FAIL issue(s) found. Fix before merging.\033[0m"
  [[ "$WARN" -gt 0 ]] && echo -e "\033[33m  $WARN warning(s)\033[0m"
  echo "════════════════════════════════════════"
  echo ""
  exit 1
else
  echo -e "\033[32m  ALL CLEAR — safe to merge dev → main\033[0m"
  [[ "$WARN" -gt 0 ]] && echo -e "\033[33m  $WARN warning(s) — review above\033[0m"
  echo "════════════════════════════════════════"
  echo ""
  exit 0
fi
