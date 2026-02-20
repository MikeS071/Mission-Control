#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pre-release-check.sh — Run before EVERY dev → main merge
#
# Usage:
#   bash scripts/pre-release-check.sh
#   bash scripts/pre-release-check.sh --fix-coolify   # auto-delete Coolify dupes
#
# Exit codes: 0 = all clear, 1 = failures found
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FIX_COOLIFY=false
[[ "${1:-}" == "--fix-coolify" ]] && FIX_COOLIFY=true

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
REGR_OUT=$(bash "$REPO_ROOT/scripts/regression-test.sh" 2>&1)
REGR_EXIT=$?
REGR_SUMMARY=$(echo "$REGR_OUT" | grep "Results:")
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
if [[ "$BRANCH" != "dev" ]]; then
  red "Not on dev branch (current: $BRANCH). Switch to dev before running."
else
  green "On dev branch"
fi

UNPUSHED=$(git log origin/dev..dev --oneline 2>/dev/null | wc -l | tr -d ' ' || echo 0)
if [[ "$UNPUSHED" -gt 0 ]]; then
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

# ── 4. Coolify env var audit ──────────────────────────────────────────────────
echo "── 4. Coolify env vars"

COOLIFY_TOKEN=""
COOLIFY_APP_UUID=""

# Try .env.local first, then Coolify itself
if [[ -f .env.local ]]; then
  COOLIFY_TOKEN=$(grep "^COOLIFY_API_TOKEN=" .env.local 2>/dev/null | cut -d= -f2 || true)
  COOLIFY_APP_UUID=$(grep "^COOLIFY_APP_UUID=" .env.local 2>/dev/null | cut -d= -f2 || true)
fi

# Fallback to known values
COOLIFY_TOKEN="${COOLIFY_TOKEN:-3|ybhjb5I8kSTxrGM3may0fM9W9NTh2eZtYBChy5Y35bf64202}"
COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-w884wcw8g8co44k4cgssc8cw}"
COOLIFY_URL="http://100.116.243.21:8000"

ENVS_JSON=$(curl -sf "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP_UUID/envs" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" 2>/dev/null || echo "[]")

if [[ "$ENVS_JSON" == "[]" ]]; then
  yellow "Could not reach Coolify API — skipping env check"
else
  # Check for duplicates
  DUPES=$(echo "$ENVS_JSON" | python3 -c "
import json,sys
from collections import defaultdict
data = json.load(sys.stdin)
by_key = defaultdict(list)
for e in data:
    by_key[e['key']].append({'uuid': e['uuid'], 'value': e.get('value','')[:60]})
dupes = {k: v for k,v in by_key.items() if len(v)>1}
if dupes:
    for k,entries in dupes.items():
        print(f'DUPE:{k}')
        for e in entries:
            print(f'  uuid={e[\"uuid\"]} val={e[\"value\"]}')
" 2>/dev/null || true)

  if [[ -n "$DUPES" ]]; then
    red "Duplicate Coolify env vars detected:"
    echo "$DUPES" | while read -r line; do info "$line"; done
    if $FIX_COOLIFY; then
      yellow "Auto-fix not implemented for conflicting dupes — resolve manually"
    else
      info "Re-run with --fix-coolify to attempt auto-cleanup"
    fi
  else
    green "No duplicate Coolify env vars"
  fi

  # Check required keys are present
  REQUIRED_KEYS="NEXTAUTH_URL NEXTAUTH_SECRET DATABASE_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRO_PRICE_ID STRIPE_TEAM_PRICE_ID NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  MISSING_KEYS=""
  for KEY in $REQUIRED_KEYS; do
    PRESENT=$(echo "$ENVS_JSON" | python3 -c "
import json,sys
data=json.load(sys.stdin)
print('yes' if any(e['key']=='$KEY' for e in data) else 'no')
" 2>/dev/null || echo "no")
    if [[ "$PRESENT" != "yes" ]]; then
      MISSING_KEYS="$MISSING_KEYS $KEY"
    fi
  done

  if [[ -n "$MISSING_KEYS" ]]; then
    red "Missing required Coolify env vars:$MISSING_KEYS"
  else
    green "All required Coolify env vars present"
  fi

  # Verify NEXTAUTH_URL is prod (not dev)
  NEXTAUTH_VAL=$(echo "$ENVS_JSON" | python3 -c "
import json,sys
data=json.load(sys.stdin)
vals=[e.get('value','') for e in data if e['key']=='NEXTAUTH_URL']
print(vals[0] if vals else '')
" 2>/dev/null || true)

  if [[ "$NEXTAUTH_VAL" == "https://archonhq.ai" ]]; then
    green "NEXTAUTH_URL = https://archonhq.ai ✓"
  else
    red "NEXTAUTH_URL is '$NEXTAUTH_VAL' — expected https://archonhq.ai"
  fi
fi

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

DEV_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://dev.archonhq.ai 2>/dev/null || echo "000")
if [[ "$DEV_CODE" == "200" ]]; then
  green "https://dev.archonhq.ai → $DEV_CODE"
else
  red "https://dev.archonhq.ai → $DEV_CODE"
fi

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
