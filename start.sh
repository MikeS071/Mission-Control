#!/usr/bin/env bash
# Kill any existing MC process
pkill -f "tsx server.ts" 2>/dev/null || true
sleep 2
cd /home/openclaw/projects/openclaw-mission-control
source .env.local 2>/dev/null || true
export NODE_ENV=production
nohup /home/openclaw/projects/openclaw-mission-control/node_modules/.bin/tsx server.ts \
  >> /tmp/mc.log 2>&1 &
echo "Mission Control started (PID $!)"

# Start Cloudflare tunnel if not running
if ! pgrep -f cloudflared > /dev/null; then
  CF_TOKEN=$(pass show apis/cloudflare-tunnel-token 2>/dev/null)
  if [ -n "$CF_TOKEN" ]; then
    nohup /home/openclaw/.local/bin/cloudflared tunnel run --token "$CF_TOKEN" \
      >> /tmp/cloudflared.log 2>&1 &
    echo "Cloudflare tunnel started (PID $!)"
  fi
fi
