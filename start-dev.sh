#!/usr/bin/env bash
# Start the DEV instance on ports 3004 (HTTPS) / 3003 (HTTP).
# Builds from the current working tree — always run on the `dev` branch.
# Does NOT touch prod (PID /tmp/mc.pid, ports 3000/3001).
DEV_PID_FILE="/tmp/mc-dev.pid"

# Kill existing dev instance
if [ -f "$DEV_PID_FILE" ]; then
  OLD_PID=$(cat "$DEV_PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  rm -f "$DEV_PID_FILE"
  sleep 1
fi

# Kill anything still bound to dev ports (PID file can go stale)
for port in 3003 3004; do
  pid=$(ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {match($0,/pid=([0-9]+)/,m); if(m[1]){print m[1]; exit}}')
  if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi
done

# Clear stale Next locks + turbopack cache (prevents Rust panics / missing SST files)
rm -f /home/openclaw/projects/openclaw-mission-control/.next/dev/lock 2>/dev/null || true
rm -rf /home/openclaw/projects/openclaw-mission-control/.next/dev/cache/turbopack 2>/dev/null || true
rm -f /home/openclaw/projects/openclaw-mission-control/.next/lock 2>/dev/null || true

cd /home/openclaw/projects/openclaw-mission-control
set -a
source .env.local 2>/dev/null || true
set +a

export NODE_ENV=development
# Turbopack is currently unstable here (Rust panics / corrupted cache).
# Force legacy webpack dev until we stabilize turbopack root/caching.
export NEXT_DISABLE_TURBOPACK=1
export NEXT_TELEMETRY_DISABLED=1
export PORT_HTTPS=3004
export PORT_HTTP=3003
export HTTP_BIND=0.0.0.0
export NEXTAUTH_URL=https://dev.archonhq.ai

# Dev mode: Next.js compiles on demand — no pre-build needed.
# Code changes are reflected on next page load without restart.
echo "Starting dev instance (on-demand compilation)..."
export NODE_OPTIONS="--max-old-space-size=3072"
nohup ./node_modules/.bin/tsx server.ts >> /tmp/mc-dev.log 2>&1 &
DEV_PID=$!
echo "$DEV_PID" > "$DEV_PID_FILE"
echo "Dev instance started (PID $DEV_PID) — https://ocprd-sgp1-01.***REDACTED_HOST***:3002 / http://127.0.0.1:3003"
