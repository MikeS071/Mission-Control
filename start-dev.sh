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

cd /home/openclaw/projects/openclaw-mission-control
set -a
source .env.local 2>/dev/null || true
set +a

export NODE_ENV=development
export PORT_HTTPS=3004
export PORT_HTTP=3003
export HTTP_BIND=0.0.0.0
export NEXTAUTH_URL=https://dev.archonhq.ai

# Dev mode: Next.js compiles on demand — no pre-build needed.
# Code changes are reflected on next page load without restart.
echo "Starting dev instance (on-demand compilation)..."
nohup NODE_OPTIONS="--max-old-space-size=3072" ./node_modules/.bin/tsx server.ts >> /tmp/mc-dev.log 2>&1 &
DEV_PID=$!
echo "$DEV_PID" > "$DEV_PID_FILE"
echo "Dev instance started (PID $DEV_PID) — https://ocprd-sgp1-01.tailb9b7d3.ts.net:3002 / http://127.0.0.1:3003"
