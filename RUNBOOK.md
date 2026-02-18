# Mission Control Runbook

## Start server
```bash
bash start.sh
```
- Starts Mission Control with `tsx server.ts`
- Writes PID to `/tmp/mc.pid`

## Stop server
```bash
kill $(cat /tmp/mc.pid)
```

## Rebuild and restart
```bash
npm run build
kill $(cat /tmp/mc.pid)
bash start.sh
```

## Important safety note
Never use:
```bash
pkill -f "next"
```
It can kill the exec shell itself. Always use the PID file approach:
```bash
kill $(cat /tmp/mc.pid)
```

## Required environment variables
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `API_SECRET` (for bearer-token API auth)
- `TELEGRAM_BOT_TOKEN` (optional, enables Telegram notifications/webhook)
- `TELEGRAM_CHAT_ID` (optional, enables Telegram notifications target)

## Secrets and credentials
- Cloudflare tunnel token is stored in pass at:
```bash
pass apis/cloudflare-tunnel-token
```

## Database access
```bash
psql "postgresql://openclaw@/mission_control?host=/var/run/postgresql"
```

## Drizzle migrations
```bash
DATABASE_URL="postgresql://openclaw@/mission_control?host=/var/run/postgresql" npx drizzle-kit push
```

## Bearer token usage
```bash
curl -H "Authorization: Bearer <secret>" https://archonhq.ai/api/tasks
```

## GitHub repository
https://github.com/MikeS071/Mission-Control
