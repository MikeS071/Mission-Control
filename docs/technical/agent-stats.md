---
title: "Agent Stats — Technical Reference"
---

# Agent Stats — Technical Reference

**Added:** 2026-02-20
**Author:** navi-ops doc-updater

## Architecture
Agent usage is write-once event data in `agent_stats`, exposed through two read paths:

- `/api/agent-stats` for latest stat per agent (chart source)
- `/api/stats/summary` for aggregated dashboard metrics (cost/tokens/active agents/progress)

UI consumers:
- `AgentCostChart.tsx` (Agents tab)
- `KanbanBoard.tsx` summary tile strip
- `AgentTeamPanel` via `/api/agents/active`

## Key files
- `src/app/api/agent-stats/route.ts` — insert + latest-per-agent select
- `src/app/api/stats/summary/route.ts` — aggregate metrics and derived savings
- `src/app/api/agents/active/route.ts` — latest heartbeat-like status by recency
- `src/components/AgentCostChart.tsx` — Recharts bar+line visualization
- `src/components/KanbanBoard.tsx` — summary tile fetch and display
- `src/db/schema.ts` — `agent_stats` table
- `src/lib/validate.ts` — `AgentStatCreateSchema`

## Database
**agent_stats**:
- `tenant_id`
- `agent_name`
- `tokens`
- `cost_usd`
- `recorded_at`

Related reads also use `tasks` and `tenant_settings` in `/api/stats/summary`.

## API surface
- `GET /api/agent-stats` (auth) — SQL `DISTINCT ON (agent_name)` latest rows
- `POST /api/agent-stats` (auth) — body `{ agentName, tokens?, costUsd? }`
- `GET /api/stats/summary` (auth) — aggregate completion/cost/token/agent stats
- `GET /api/agents/active` (auth) — latest per-agent record + computed status (`working|idle|inactive`)

## Tenant isolation
All agent-stats routes require tenant resolution via `resolveTenantId(req)` and filter all SQL/Drizzle queries with `tenant_id = tenantId`. No cross-tenant aggregate is exposed.

## Implementation notes
- Read queries use raw SQL for efficient `DISTINCT ON` and aggregate calculations.
- `savedUsd` is derived from configured savings rate in `tenant_settings` (default 30%).
- Active status thresholds:
  - ≤5m: working
  - ≤60m: idle
  - otherwise: inactive

## Extension points
- Store normalized numeric cost type (numeric) instead of text at insert boundary.
- Add historical time-bucket endpoints for trend charts.
- Add per-model or per-workflow dimensions to `agent_stats`.