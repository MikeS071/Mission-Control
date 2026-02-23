# PRD — Telegram Webhook Ingress + Mission Control Gate (Option A / Decision 1)

**Status:** Draft (approved decisions: per-user linking; session key `tg:{tenantId}:{telegramUserId}`)

## 0) Summary
Mission Control (MC) becomes the **only ingress** for Telegram messages via a Telegram Bot API webhook. MC persists all inbound/outbound messages in its DB (canonical history), pushes updates to the browser via WebSocket (instant UI), and acts as a **policy gate** before forwarding allowed requests to OpenClaw Gateway for assistant responses.

This architecture unlocks future enforcement (RBAC, plan limits, tool restrictions) because **every Telegram update is evaluated by MC first**.

## 1) Goal
- Real-time sync: Telegram DM ↔ MC UI, and assistant replies reflected in both.
- MC is the control plane: **authorize / deny / rate-limit** before OpenClaw sees anything.
- Keep OpenClaw as compute/orchestration, not the ingress surface.

## 2) Non-goals (v1)
- Telegram groups / multi-participant permissions
- Full RBAC + usage limits (we add a stub hook now)
- Streaming partial replies to Telegram
- Replacing MC DB with Telegram as source of truth (Bot API doesn’t provide durable queryable history)

## 3) Personas / Assumptions
- **Single developer** (Mike) using `dev.archonhq.ai` with hot reload.
- Users can install and use Telegram.
- OpenClaw gateway is reachable from MC at `http://127.0.0.1:18789`.

## 4) UX / Onboarding (Deep-link)
### User story
As an MC user, I click **Connect Telegram**, it opens a Telegram deep-link to the bot, I press Start, and the connection is established.

### Flow
1. MC UI: user clicks **Connect Telegram**
2. MC issues a one-time token and opens:
   - `https://t.me/<bot_username>?start=<token>`
3. Telegram: user taps **Start** (or sends `/start <token>`)
4. Telegram sends update → MC webhook
5. MC validates token, links Telegram identity, confirms in Telegram and MC UI

### Binding (approved)
- **Per-user** linking.
- Primary identity key: `message.from.id` (Telegram user ID)
- Store `message.chat.id` (DM chat id) for sending replies.

## 5) System Architecture
### High-level pipeline
**Telegram → MC (webhook)** → persist → WS broadcast (browser) → authorize (gate) → forward to OpenClaw → persist reply → WS broadcast → send reply to Telegram.

### Key principles
- MC DB remains canonical history.
- Webhook is idempotent and fast.
- Gate check happens **before** forwarding to OpenClaw.

## 6) API Surface

### 6.1 Telegram webhook endpoint (new)
`POST /api/telegram/webhook`

**Auth**
- Validate Telegram secret header:
  - `X-Telegram-Bot-Api-Secret-Token: <MC_TELEGRAM_WEBHOOK_SECRET>`

**Idempotency**
- Dedupe using Telegram `update_id`.
- Return `200 OK` for duplicates.

**Supported updates (v1)**
- `message` (private chats / DMs)
- Ignore any update where `message.from.is_bot === true` (prevents loops)

**Behavior**
- If `/start <token>`:
  - validate token
  - create link
  - mark token consumed
  - respond to Telegram: “Connected ✅”
- Else normal message:
  - resolve link by `telegramUserId`
  - if unlinked: respond “Not connected — click Connect Telegram in MC”
  - persist user message in `chat_messages`
  - broadcast to browser via MC WS
  - authorize (gate)
  - if denied: respond denial message in Telegram (and store denial metadata)
  - if allowed: forward to OpenClaw

### 6.2 Link token mint endpoint (new)
`POST /api/telegram/link-token`
- Requires NextAuth
- Returns: `{ token, deepLinkUrl, expiresAt }`

### 6.3 Disconnect endpoint (new)
`POST /api/telegram/disconnect`
- Requires NextAuth
- Revokes link (sets `revokedAt`)

## 7) Database Model

### 7.1 New tables
**telegram_links**
- `id`
- `tenantId`
- `userId`
- `telegramUserId` (bigint, **unique**)
- `telegramChatId` (bigint)
- `createdAt`
- `revokedAt` (nullable)

**telegram_link_tokens**
- `token` (pk)
- `tenantId`
- `userId`
- `expiresAt`
- `consumedAt` (nullable)
- `createdAt`

**telegram_updates**
- `updateId` (bigint pk)
- `tenantId` (nullable)
- `telegramUserId` (nullable)
- `receivedAt`
- `processedAt`
- `status` enum: `ignored | linked | forwarded | denied | error`
- `error` (nullable)

### 7.2 Existing tables
**chat_messages**
- remains canonical history.
- Optional v1 extension (recommended for debugging):
  - `source`: `'telegram' | 'mc'`
  - `externalId`: Telegram `message_id`

## 8) Gate / Authorization Hook

### 8.1 Contract
`authorizeInbound({ tenantId, userId, telegramUserId, content, kind }) -> { allow: boolean, reason?: string }`

### 8.2 v1 behavior
- Always allow (unconstrained), but keep the hook in place.

### 8.3 Future behavior
- plan limits (messages/day, token caps)
- tool permission restrictions (exec/file access)
- approvals for sensitive actions

## 9) OpenClaw Forwarding
MC forwards allowed messages to OpenClaw Gateway:

`POST http://127.0.0.1:18789/v1/chat/completions`

Headers:
- `Authorization: Bearer OPENCLAW_GATEWAY_TOKEN`
- `x-openclaw-agent-id: main`
- `x-openclaw-session-key: tg:{tenantId}:{telegramUserId}` (**approved**)

Conversation context:
- v1: load last N messages from `chat_messages` (tenant-scoped) OR rely on session key continuity.
- Always persist both sides in MC DB regardless.

## 10) Telegram Outbound
MC sends replies via Bot API:
- `sendMessage(chat_id=telegramChatId, text=reply)`
- plain text (no parse_mode) to avoid formatting failures

## 11) Reliability / Failure Modes
- MC down: webhook retries; user sees delay.
- OpenClaw down: MC responds “Assistant unavailable” and logs error.
- Duplicate updates: handled via `update_id` dedupe.
- Looping: ignore `from.is_bot`.

## 12) Rollback Plan
- Disable Telegram webhook (`deleteWebhook`)
- Re-enable OpenClaw Telegram polling ingestion (previous mode)
- MC continues to function via MC UI chat.

## 13) Success Criteria
- Deep-link connect works end-to-end in <30s.
- Telegram message shows in MC UI in <250ms (webhook → DB → WS).
- Assistant reply shows in Telegram and MC.
- No duplicate processing (idempotency works).

## 14) Open Questions (none blocking)
- Whether to add `source/externalId` fields to `chat_messages` in v1.
- Whether to ACK Telegram immediately and send a “Processing…” message for long OpenClaw responses.
