#!/usr/bin/env bash
# Kill any existing MC process
pkill -f "tsx server.ts" 2>/dev/null || true
sleep 2
cd /home/openclaw/projects/openclaw-mission-control
source .env.local 2>/dev/null || true
export NODE_ENV=production
nohup /home/openclaw/projects/openclaw-mission-control/node_modules/.bin/tsx server.ts \
  >> /home/openclaw/projects/openclaw-mission-control/server.log 2>&1 &
echo "Mission Control started (PID $!)"
