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

echo "[integration] applying drizzle migrations..."
# Apply migrations from drizzle/migrations via drizzle-kit migrate
npx drizzle-kit migrate --config drizzle.config.ts

echo "[integration] DB smoke checks..."
npx tsx scripts/test-integration-smoke.ts

echo "[integration] ok"
