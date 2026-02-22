---
title: "Notifications: Technical Reference"
description: "Telegram notification delivery, event triggers, and API reference."
---

# Notifications: Technical Reference

## Files

| Path | Purpose |
|------|---------|
| `src/lib/telegram.ts` | `sendTelegramMessage(text)` — core send function |
| `src/app/api/notifications/test/route.ts` | POST — sends test message to configured chat |
| `src/app/api/tasks/route.ts` | Triggers notifications on task create |
| `src/app/api/tasks/[id]/route.ts` | Triggers on status change (→ review, → done) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather (format: `<id>:<hash>`) |
| `TELEGRAM_CHAT_ID` | Numeric Telegram user/group ID |

Both are set in `.env.local`. In production, inject via Coolify environment.

## Send Function

```typescript
// src/lib/telegram.ts
export async function sendTelegramMessage(text: string): Promise<void>
```

- Uses `https://api.telegram.org/bot{TOKEN}/sendMessage`
- `parse_mode: "HTML"` — use `<b>`, `<i>`, `<code>` for formatting
- Non-blocking — errors are logged, never thrown to callers
- Fire-and-forget from task API routes

## Notification Triggers

| Event | Condition | Message format |
|-------|-----------|----------------|
| Task created | Always | `📋 New task: {title} [{priority}]` |
| Status → Review | On PATCH status change | `👀 Ready for review: {title}` |
| Status → Done | On PATCH status change | `✅ Done: {title}` |
| Kanban trigger | Card created or moved to In Progress | `📋 [Kanban Trigger]: {title}` |
| Test notification | POST /api/notifications/test | Test message with timestamp |

## HTML Formatting Rules

Telegram's HTML parse mode supports: `<b>`, `<i>`, `<code>`, `<pre>`, `<a href>`. Do **not** use Markdown (`**bold**`) — Telegram's legacy Markdown v1 parser will reject it with HTTP 400.

## Rate Limits

Telegram allows ~30 messages/second per bot. For bulk operations (e.g. provisioning status), batch updates into a single message or add a delay between sends.

## Testing

```bash
curl -X POST http://localhost:3003/api/notifications/test \
  -H "Cookie: <session-cookie>"
```

Returns `{"sent": true}` on success. Requires valid session.
