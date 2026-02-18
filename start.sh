#!/usr/bin/env bash
set -e

MC_PID_FILE="/tmp/mc.pid"
CF_PID_FILE="/tmp/cloudflared.pid"

# Kill existing MC process by PID file
if [ -f "$MC_PID_FILE" ]; then
  OLD_PID=$(cat "$MC_PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  rm -f "$MC_PID_FILE"
  sleep 1
fi

cd /home/openclaw/projects/openclaw-mission-control
source .env.local 2>/dev/null || true
export NODE_ENV=production

nohup ./node_modules/.bin/tsx server.ts >> /tmp/mc.log 2>&1 &
MC_PID=$!
echo "$MC_PID" > "$MC_PID_FILE"
echo "Mission Control started (PID $MC_PID)"

# Start Cloudflare tunnel if not running
if [ -f "$CF_PID_FILE" ]; then
  OLD_CF=$(cat "$CF_PID_FILE")
  kill -0 "$OLD_CF" 2>/dev/null && { echo "Cloudflare tunnel already running (PID $OLD_CF)"; exit 0; }
fi

CF_TOKEN=$(pass show apis/cloudflare-tunnel-token 2>/dev/null)
if [ -n "$CF_TOKEN" ]; then
  nohup /home/openclaw/.local/bin/cloudflared tunnel run --token "$CF_TOKEN" \
    >> /tmp/cloudflared.log 2>&1 &
  CF_PID=$!
  echo "$CF_PID" > "$CF_PID_FILE"
  echo "Cloudflare tunnel started (PID $CF_PID)"
fi
