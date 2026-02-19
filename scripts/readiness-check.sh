#!/usr/bin/env bash
# Implementation Readiness Check
# Validates schema ↔ API ↔ tests coherence before merge
# Usage: bash scripts/readiness-check.sh [base_url]
# Example: bash scripts/readiness-check.sh http://127.0.0.1:3003

BASE_URL="${1:-http://127.0.0.1:3003}"
PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }
warn()  { echo -e "\033[33m⚠️  $1\033[0m"; }

echo "=== Implementation Readiness Check ==="
echo "Target: $BASE_URL"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "--------------------------------------"

# 1. Schema ↔ Migration coherence
echo ""
echo "## 1. Schema ↔ Migration Coherence"

# Extract column names defined in schema.ts
SCHEMA_COLS=$(grep -oP "(?<=text|integer|boolean|timestamp|jsonb)\('[a-z_]+'\)" src/db/schema.ts 2>/dev/null | grep -oP "(?<=')[a-z_]+(?=')" | sort)
# Extract columns from migration files
MIGRATION_COLS=$(grep -ohP "ADD COLUMN IF NOT EXISTS [a-z_]+" drizzle/migrations/*.sql 2>/dev/null | awk '{print $NF}' | sort)

if [ -z "$SCHEMA_COLS" ] && [ -z "$MIGRATION_COLS" ]; then
  warn "Could not parse schema.ts or no migrations found — manual check needed"
  ((WARN++))
else
  # Check migrations reference columns that exist in schema
  if [ -n "$MIGRATION_COLS" ]; then
    while IFS= read -r col; do
      if echo "$SCHEMA_COLS" | grep -q "^${col}$"; then
        green "Migration column '$col' found in schema.ts"
        ((PASS++))
      else
        red "Migration column '$col' NOT found in schema.ts — schema/migration mismatch!"
        ((FAIL++))
      fi
    done <<< "$MIGRATION_COLS"
  else
    green "No new migrations to check"
    ((PASS++))
  fi
fi

# 2. API routes exist and respond
echo ""
echo "## 2. API Health Check"

API_ROUTES=$(grep -rh "export async function GET\|export async function POST\|export async function PATCH\|export async function DELETE" src/app/api/ 2>/dev/null | wc -l)
green "Found $API_ROUTES exported API handlers"
((PASS++))

# Check server is reachable
if curl -sf "$BASE_URL/api/tasks" -H "Authorization: Bearer test" > /dev/null 2>&1 || \
   curl -sf "$BASE_URL/api/tasks" > /dev/null 2>&1; then
  green "Dev server is reachable at $BASE_URL"
  ((PASS++))
else
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/tasks" 2>/dev/null)
  if [ "$HTTP_STATUS" = "401" ] || [ "$HTTP_STATUS" = "403" ]; then
    green "Dev server reachable (auth required — expected)"
    ((PASS++))
  else
    red "Dev server NOT reachable at $BASE_URL (status: $HTTP_STATUS) — restart required before merge"
    ((FAIL++))
  fi
fi

# 3. Test scripts exist for new API routes
echo ""
echo "## 3. Test Coverage"

ROUTE_DIRS=$(find src/app/api -name "route.ts" 2>/dev/null | wc -l)
TEST_SCRIPTS=$(find scripts -name "test-*.sh" 2>/dev/null | wc -l)

green "API route files: $ROUTE_DIRS"
green "Test scripts: $TEST_SCRIPTS"

if [ "$TEST_SCRIPTS" -eq 0 ]; then
  red "No test scripts found — at least one required"
  ((FAIL++))
elif [ "$TEST_SCRIPTS" -lt 3 ]; then
  warn "Only $TEST_SCRIPTS test scripts — verify all features are covered"
  ((WARN++))
else
  green "Test script count looks sufficient"
  ((PASS++))
fi

# 4. Check for common pitfalls
echo ""
echo "## 4. Common Pitfalls"

# Await in non-async — check for top-level await outside async functions
# Only flag if 'await' appears at module/component body level (0-2 indent), not inside function bodies
AWAIT_ISSUES=$(grep -rn "^await\|^  await " src/components/ 2>/dev/null | grep -v "//\|async\|function\|=>" | head -5)
if [ -n "$AWAIT_ISSUES" ]; then
  red "Possible top-level 'await' in non-async context in components:"
  echo "$AWAIT_ISSUES"
  ((FAIL++))
else
  green "No top-level await-in-non-async issues in components"
  ((PASS++))
fi

# Console.log left in API routes
CONSOLE_LOGS=$(grep -rn "console\.log" src/app/api/ 2>/dev/null | wc -l)
if [ "$CONSOLE_LOGS" -gt 5 ]; then
  warn "$CONSOLE_LOGS console.log statements in API routes — consider removing"
  ((WARN++))
else
  green "console.log count in APIs: $CONSOLE_LOGS (acceptable)"
  ((PASS++))
fi

# 5. Git state
echo ""
echo "## 5. Git State"

UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
  warn "$UNCOMMITTED uncommitted file(s) — verify none are unintended"
  git status --short 2>/dev/null | head -10
  ((WARN++))
else
  green "Working tree clean"
  ((PASS++))
fi

LAST_COMMIT=$(git log --oneline -1 2>/dev/null)
echo "Last commit: $LAST_COMMIT"

# Summary
echo ""
echo "======================================"
echo "READINESS SUMMARY"
echo "======================================"
green "Passed: $PASS"
if [ "$WARN" -gt 0 ]; then warn "Warnings: $WARN"; fi
if [ "$FAIL" -gt 0 ]; then red "Failed: $FAIL"; fi
echo ""

# Confidence score: start at 100, deduct per failure/warning
TOTAL_CHECKS=$((PASS + FAIL + WARN))
CONFIDENCE_SCORE=100
if [ "$TOTAL_CHECKS" -gt 0 ]; then
  DEDUCT_FAIL=$(( FAIL * 20 ))
  DEDUCT_WARN=$(( WARN * 5 ))
  CONFIDENCE_SCORE=$(( 100 - DEDUCT_FAIL - DEDUCT_WARN ))
  [ "$CONFIDENCE_SCORE" -lt 0 ] && CONFIDENCE_SCORE=0
fi

if [ "$CONFIDENCE_SCORE" -ge 90 ]; then
  AUTO_MERGE="yes"
else
  AUTO_MERGE="no"
fi

echo "CONFIDENCE_SCORE=$CONFIDENCE_SCORE"
echo "AUTO_MERGE=$AUTO_MERGE"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "🔴 NOT READY — fix failures before merge"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "🟡 REVIEW WARNINGS before merge"
  exit 0
else
  echo "🟢 READY TO MERGE"
  exit 0
fi
