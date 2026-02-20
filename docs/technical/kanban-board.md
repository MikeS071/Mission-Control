# Kanban Board — Technical Reference

**Added:** 2026-02-20
**Author:** navi-ops doc-updater

## Architecture
The Kanban board is a client component (`KanbanBoard.tsx`) rendered in the Dashboard Kanban tab. It reads and mutates task state through tenant-scoped API routes:

- `GET/POST/PATCH/DELETE /api/tasks`
- `GET/PATCH/DELETE /api/tasks/[id]`
- `GET /api/tasks/stream` (SSE)
- `GET /api/events` (per-card history)
- `GET /api/stats/summary` (tiles)
- `GET /api/agents/active` (team panel)

Data flow:
`KanbanBoard` → fetch/drag/edit actions → API route validation (`zod`) → Drizzle queries on `tasks/events/agent_stats` → response → local state reconciliation.

## Key files
- `src/components/KanbanBoard.tsx` — full board UI (DnD, filters, dialogs, WIP limits, history pane, stats tiles)
- `src/app/api/tasks/route.ts` — list/create/bulk-patch/delete (body includes `id` for PATCH/DELETE)
- `src/app/api/tasks/[id]/route.ts` — single-task read/update/delete
- `src/app/api/tasks/stream/route.ts` — SSE stream; polls DB every 5s and emits full task list
- `src/app/api/events/route.ts` — event feed used for per-card history drawer
- `src/lib/validate.ts` — `TaskCreateSchema` / `TaskPatchSchema` input validation
- `src/db/schema.ts` — `tasks` and `events` table definitions

## Database
- **tasks**: `tenant_id`, `title`, `description`, `status`, `priority`, `goal`, `goal_id`, `assigned_agent`, `tags`, `checklist`, timestamps
- **events**: `tenant_id`, `task_id`, `agent_name`, `event_type`, `payload`, `created_at`

Checklist data is stored as serialized text on `tasks.checklist` and transformed via `parseChecklist/stringifyChecklist`.

## API surface
- `GET /api/tasks` (auth required) — tenant task list ordered by `created_at`
- `POST /api/tasks` (auth required) — create task; normalizes status/priority, auto-generates `goalId`
- `PATCH /api/tasks` (auth required) — update task by body `{ id, ...patch }`
- `DELETE /api/tasks` (auth required) — delete task by body `{ id }`
- `GET /api/tasks/[id]` (auth required) — fetch one task
- `PATCH /api/tasks/[id]` (auth required) — update one task
- `DELETE /api/tasks/[id]` (auth required) — delete one task
- `GET /api/tasks/stream` (auth required) — text/event-stream for board refresh
- `GET /api/events?taskId=<id>` (auth required) — task-specific event timeline

## Tenant isolation
All Kanban routes scope queries by `tenantId` from `resolveTenantId()`/`getTenantId()`. Every read/write includes `WHERE tasks.tenant_id = tenantId` (and equivalent for events), preventing cross-tenant task access.

## Implementation notes
- Task status normalization maps variants (`in progress`, `assigned`, `review`) to `in_progress`.
- PATCH on collection route requires an explicit `id` in the body.
- Status transitions write event records and may trigger Telegram notifications and XP updates.
- Board preferences (labels, collapsed columns, WIP limits) are not server-persisted.

## Extension points
- Persist board presentation settings in `tenant_settings` instead of localStorage.
- Add server-side WIP enforcement by rejecting moves/updates over limit.
- Add optimistic update rollback telemetry for failed PATCH/DELETE calls.