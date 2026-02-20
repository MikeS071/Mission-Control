#!/usr/bin/env bash
# ⚠️  DEPRECATED — DO NOT USE
# Prod is now served via Coolify container (port 3002) + tls-proxy.js (port 3001).
# Running this script will hijack port 3001 and break prod by serving a stale build.
# To restart prod: trigger a Coolify redeploy, then ensure tls-proxy.js is running.
#   curl -s -X GET "http://100.116.243.21:8000/api/v1/deploy?uuid=w884wcw8g8co44k4cgssc8cw&force=true" \
#     -H "Authorization: Bearer <token>"
#   nohup node /home/openclaw/projects/tls-proxy.js > /tmp/tls-proxy.log 2>&1 &
echo "❌  start.sh is deprecated. Prod runs via Coolify + tls-proxy.js. See comments above."
exit 1

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
set -a
source .env.local 2>/dev/null || true
set +a
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
