#!/bin/bash
# Build lock — prevents concurrent Docker/Next.js builds from exhausting RAM.
# Usage: source this file before any build, or call acquire_build_lock / release_build_lock.

LOCK_FILE="/tmp/mc-build.lock"
LOCK_TIMEOUT=600  # 10 min max

acquire_build_lock() {
  local waited=0
  while [ -f "$LOCK_FILE" ]; do
    local pid=$(cat "$LOCK_FILE" 2>/dev/null)
    # Stale lock check
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "[build-lock] Stale lock (PID $pid gone), clearing."
      rm -f "$LOCK_FILE"
      break
    fi
    if [ $waited -ge $LOCK_TIMEOUT ]; then
      echo "[build-lock] Timeout waiting for build lock. Aborting." >&2
      exit 1
    fi
    echo "[build-lock] Build in progress (PID $pid), waiting..."
    sleep 10
    waited=$((waited + 10))
  done
  echo $$ > "$LOCK_FILE"
  echo "[build-lock] Lock acquired (PID $$)"
}

release_build_lock() {
  rm -f "$LOCK_FILE"
  echo "[build-lock] Lock released"
}

# Trap to release lock on exit/error
trap release_build_lock EXIT INT TERM
