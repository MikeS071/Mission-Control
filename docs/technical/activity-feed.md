---
title: "Activity Feed: Technical Reference"
description: "Database schema, event library, API routes, SSE broadcaster, and event hook reference for the social activity feed."
---

# Activity Feed: Technical Reference

## Architecture

Events flow through a two-stage pipeline:

```
caller → emitEvent() → activity_queue → drainQueue() → activity_events → SSE → clients
```

1. **Emit**: `emitEvent()` does a fire-and-forget insert into `activity_queue`. Never throws. Safe to call from any route.
2. **Drain**: `drainQueue()` reads unprocessed queue rows, groups same-type events within 5-minute windows (≥3 = single tile), writes to `activity_events`, marks queue rows processed.
3. **Broadcast**: After drain, `broadcastFeedUpdate()` pushes new events to all registered SSE clients for the tenant.

---

## Database schema

### `activity_queue`
Staging table for raw events. Processed by `drainQueue()`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `tenant_id` | int | FK → tenants |
| `event_type` | text | See event types below |
| `payload_json` | jsonb | Arbitrary event context |
| `created_at` | timestamptz | Defaults to now |
| `processed` | bool | Set to true after drain |

Index: `(tenant_id, processed, created_at)` WHERE `processed = false`

### `activity_events`
Processed, display-ready events.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | int | FK → tenants |
| `event_type` | text | |
| `display_name` | text | Human label (e.g. "Rank up") |
| `description` | text | Detail text |
| `icon` | text | Emoji icon |
| `payload_json` | jsonb | Includes `count` + `samples` for grouped events |
| `created_at` | timestamptz | |

Index: `(tenant_id, created_at DESC)`

### `activity_reactions`
Per-tenant, per-event, per-type reactions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `event_id` | uuid | FK → activity_events |
| `from_tenant_id` | int | FK → tenants |
| `reaction_type` | text | CHECK IN ('hype','respect','tribute') |
| `created_at` | timestamptz | |

Unique constraint: `(event_id, from_tenant_id, reaction_type)`

### `activity_comments`
Persisted comments on events.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `event_id` | uuid | FK → activity_events |
| `tenant_id` | int | FK → tenants |
| `body` | text | CHECK char_length ≤ 500 |
| `created_at` | timestamptz | |

### `chat_threads`
Thread containers for `chat_messages`.

| Column | Type | Notes |
|---|---|---|
| `id` | serial | PK |
| `tenant_id` | int | FK → tenants |
| `title` | text | Default 'New thread' |
| `created_at` / `updated_at` | timestamptz | |

`chat_messages` has a new nullable `thread_id` FK → `chat_threads(id) ON DELETE SET NULL`. Existing messages were backfilled into a default "Main" thread per tenant.

---

## Event library — `src/lib/activity.ts`

### `ActivityEventType`
```typescript
type ActivityEventType =
  | 'badge_earned'
  | 'xp_rank_up'
  | 'challenge_completed'
  | 'streak_milestone'
  | 'tasks_burst'
  | 'all_tasks_cleared';
```

### `emitEvent(tenantId, eventType, payload?)`
Fire-and-forget queue insert. Never throws.
```typescript
void emitEvent(tenantId, 'badge_earned', { badgeName: 'Sprint Champion', xpAwarded: 50 });
```

### `drainQueue(tenantId?)`
Processes queue → events with 5-min grouping. Returns inserted `activity_events` rows. Called by `POST /api/activity/drain`.

### SSE broadcaster
Module-level singleton Map: `tenantId → Set<ReadableStreamDefaultController>`.

```typescript
registerFeedClient(tenantId, controller)     // call on SSE connect
unregisterFeedClient(tenantId, controller)   // call on SSE disconnect
broadcastFeedUpdate(tenantId, eventName, data) // push to all clients
```

---

## API routes

### `GET /api/activity/events`
Cursor-paginated feed, newest first.

**Query params:**
- `cursor` — ISO timestamp (exclusive upper bound from previous page)
- `limit` — default 20, max 50

**Response:**
```json
{
  "events": [{ ...event, "reactions": { "hype": 0, "respect": 0, "tribute": 0 } }],
  "nextCursor": "2026-02-23T10:00:00.000Z" // null if no more pages
}
```

### `GET /api/activity/stream`
SSE endpoint. Pushes:
- `activity.event.created` — new event after drain
- `activity.reaction.updated` — reaction counts changed
- `activity.comment.created` — new comment

Keepalive comment sent every 25 seconds. Set `X-Accel-Buffering: no` header disables Nginx buffering.

### `POST /api/activity/drain`
Triggers queue processing and SSE broadcast.

**Auth:** `x-drain-secret` header must match `MC_API_SECRET` env var (falls back to `DEPLOY_WEBHOOK_SECRET`).

**Query params:** `?tenantId=N` (optional; drains all tenants if omitted)

### `POST /api/activity/reactions`
```json
{ "eventId": "uuid", "reactionType": "hype" | "respect" | "tribute" }
```
- No self-react (reactor tenant ≠ event tenant)
- Rate limit: 10 reactions/tenant/hour (in-memory window)
- Upsert — duplicate reactions silently ignored
- Returns `{ ok: true, counts: { hype, respect, tribute } }`
- SSE pushes `activity.reaction.updated` to event owner's tenant

### `GET /api/activity/comments?eventId=<uuid>`
Returns comments oldest-first with `tenantName` joined from `tenants` table.

### `POST /api/activity/comments`
```json
{ "eventId": "uuid", "body": "string ≤500 chars" }
```
Persists comment. SSE pushes `activity.comment.created` to both the event owner and the commenter (if different tenants).

---

## Event hooks

All hooks use `void emitEvent(...)` — fire-and-forget, no try/catch required in callers.

| Hook | File | Trigger condition |
|---|---|---|
| `xp_rank_up` | `src/lib/xp.ts` | XP insert causes rank threshold to cross (pre/post comparison) |
| `streak_milestone` | `src/lib/xp.ts` | Streak hits exactly 7, 30, or 100 days |
| `challenge_completed` | `src/app/api/gamification/challenges/[id]/complete/route.ts` | Challenge status set to completed |
| `badge_earned` | `src/app/api/arena/claim/route.ts` | Arena challenge reward claimed |
| `tasks_burst` | `src/app/api/tasks/[id]/route.ts` | Task marked done + ≥10 tasks done in last 24h |
| `all_tasks_cleared` | `src/app/api/tasks/[id]/route.ts` | Task marked done + 0 non-done tasks remain |
