---
title: MC ↔ Telegram ↔ OpenClaw Gateway (Dev)
---

# MC ↔ Telegram ↔ OpenClaw Gateway (Dev)

This doc captures the current dev integration wiring between:
- **Telegram** (any client: iOS + Desktop) via Bot API
- **Mission Control (MC)** chat UI + APIs
- **OpenClaw Gateway** (local)

## Goals
- Telegram messages appear **instantly** in MC Chat UI.
- MC Chat messages mirror to Telegram as a bot message prefixed with `👤`.
- Telegram shows native `… typing` while MC/OpenClaw are processing.

## Data flow

### Telegram → MC
1. Telegram user sends a message to the bot.
2. Telegram calls MC webhook:
   - `POST /api/telegram/webhook`
3. Webhook resolves tenant via `telegram_links`.
4. Webhook inserts into `chat_messages`:
   - `role=user`, `source=telegram`, `external_id = telegram message_id`
   - idempotent due to unique index on `(tenant_id, source, external_id) WHERE external_id IS NOT NULL`
5. Webhook broadcasts to MC clients:
   - `wsManager.broadcast(tenantId, {id, role, content, createdAt})`

### MC → Telegram
1. User sends message in MC ChatPanel.
2. MC route:
   - `POST /api/chat/gateway`
3. Immediately mirrors user text to Telegram:
   - `👤 <message>`
4. Starts Telegram `sendChatAction(typing)` loop until reply is persisted/sent.
5. Proxies request to OpenClaw Gateway:
   - `${GATEWAY_URL}/v1/chat/completions`
   - headers include `Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN`, `x-openclaw-agent-id: main`, `x-openclaw-session-key: web:mc:{tenantId}:m{userMessageId}`
6. Persists assistant reply to `chat_messages` and broadcasts to WS.
7. Mirrors assistant reply to Telegram.

## Key env vars (MC)
- `GATEWAY_URL=http://127.0.0.1:18789`
- `OPENCLAW_GATEWAY_TOKEN=...`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- `MC_TELEGRAM_WEBHOOK_SECRET=...` (protects `/api/telegram/webhook`)

## Notes
- Telegram bots cannot impersonate the human sender. The `👤` prefix is the best available UX.
- MC ChatPanel supports pagination:
  - initial: `limit=80`
  - scroll-up loads older: `limit=80&beforeId=...`
- For debugging gateway flakiness, `/api/chat/gateway` returns `debugError` in dev.

## Tests run (dev)
- `npm test` (Jest)
- `NODE_OPTIONS=--max-old-space-size=4096 npm run build`
