#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for integration tests" >&2
  exit 2
fi

echo "[integration] waiting for postgres..."
npx tsx scripts/test-integration-wait.ts

echo "[integration] resetting schema..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

echo "[integration] applying SQL migrations (drizzle/migrations/*.sql)..."
for f in $(ls drizzle/migrations/*.sql | sort); do
  echo "[integration] migrate: $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "[integration] DB smoke checks..."
npx tsx scripts/test-integration-smoke.ts

echo "[integration] ok"
