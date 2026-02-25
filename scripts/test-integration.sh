#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for integration tests" >&2
  exit 2
fi

echo "[integration] waiting for postgres..."
node scripts/test-integration-wait.js

echo "[integration] applying drizzle migrations..."
# Apply migrations from drizzle/migrations via drizzle-kit migrate
npx drizzle-kit migrate --config drizzle.config.ts

echo "[integration] DB smoke checks..."
node scripts/test-integration-smoke.js

echo "[integration] ok"
