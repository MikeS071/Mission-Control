---
title: "Activity Feed: Technical Reference"
---

# Activity Feed: Technical Reference

**Added:** 2026-02-20
**Author:** navi-ops doc-updater

## Architecture
The activity feature is split between:
1) a global feed in `ActivityFeed.tsx`, and
2) per-card history in `KanbanBoard.tsx`.

Both consume `GET /api/events`, optionally filtered by `taskId`. Events are created by task lifecycle handlers (`/api/tasks*`) and can also be posted directly via `POST /api/events`.

## Key files
- `src/components/ActivityFeed.tsx`, dashboard feed; polls `/api/events?limit=100` every 30s
- `src/components/EventTimeline.tsx`, shared timeline renderer (badges, timestamps, payload)
- `src/components/KanbanBoard.tsx`, per-card History toggle + fetch `/api/events?taskId=...`
- `src/app/api/events/route.ts`, event query and creation API
- `src/app/api/tasks/route.ts`, writes `created`, `status_change`, `deleted` events
- `src/app/api/tasks/[id]/route.ts`, writes `status_change` and `deleted` events
- `src/db/schema.ts`, `events` and `tasks` tables

## Database
- **events** table: `id`, `tenant_id`, `task_id`, `agent_name`, `event_type`, `payload`, `created_at`
- Optional join to **tasks** for `taskTitle` in API responses

## API surface
- `GET /api/events?limit=<1..100>&taskId=<id?>`, tenant-scoped event feed
- `POST /api/events`, create event (`taskId?`, `agentName?`, `eventType`, `payload?`)

Auth: required (tenant resolved via request/session headers).

## Tenant isolation
`/api/events` uses `resolveTenantId(req)` and applies tenant filters on all queries (`events.tenant_id = tenantId`), including filtered task timelines. Event creation always writes the resolved `tenantId`.

## Implementation notes
- The API clamps `limit` to 1..100.
- Feed query left-joins `tasks` to include current task title.
- `EventTimeline` formats both relative time and locale timestamp on render.

## Extension points
- Add server-side pagination/cursors for long histories.
- Standardize `eventType` to an enum for stricter analytics.
- Add structured JSON payload support (currently text) for richer timeline rendering.