---
title: "Connection Wizard: Technical Reference"
description: "Implementation details for the 8-step connection wizard, state persistence, and provider key management."
---

# Connection Wizard: Technical Reference

## Files

| Path | Purpose |
|------|---------|
| `src/app/dashboard/connect/page.tsx` | Main wizard page — renders step components |
| `src/components/wizard/` | Per-step components (Step1Welcome, Step2Gateway, …) |
| `src/app/api/gateway/ping/route.ts` | POST — validates gateway connectivity |
| `src/app/api/wizard/state/route.ts` | GET/POST — persist + retrieve wizard completion state |
| `src/app/api/aipipe/proxy/chat/route.ts` | POST — AiPipe proxy wired in Step 4 |

## State Persistence

Wizard completion state is stored per-tenant in the database. The `wizard_state` column in the `tenants` table tracks which steps are complete as a JSON bitmask or step index. Step skips are allowed for Steps 4–8.

```typescript
// Typical shape stored in tenants.wizard_state
{
  completedSteps: [1, 2, 3, 4],
  gatewayUrl: "http://localhost:18789",
  smartRoutingEnabled: true
}
```

## Gateway Ping

`POST /api/gateway/ping` — forwards a health-check to the user-supplied gateway URL.

```typescript
// Request
{ gatewayUrl: string }

// Response 200
{ ok: true, latencyMs: number }

// Response 400/503
{ ok: false, error: string }
```

The ping endpoint does not store the URL; it only validates reachability. URL is stored client-side until wizard submission.

## Provider Key Management

Step 3 posts keys to `POST /api/aipipe/proxy` → AiPipe `/v1/tenants/{id}/providers`. Keys are:
- Stored in AiPipe's SQLite per-tenant key store
- Never written to the MC database or logs
- Scoped per tenant: other tenants cannot access your keys

## Agent Role Assignment (Step 6)

Agent roles are stored in the `agent_roles` table:

```sql
CREATE TABLE agent_roles (
  id         serial PRIMARY KEY,
  tenant_id  integer NOT NULL REFERENCES tenants(id),
  agent_name text NOT NULL,
  role       text NOT NULL,
  created_at timestamp DEFAULT now()
);
```

Roles are surfaced in the Kanban board header tiles and agent stats view.

## Wizard Steps Overview

| Step | ID | Component | Skippable | Stores |
|------|----|-----------|-----------|----|
| 1 | welcome | Step1Welcome | — | nothing |
| 2 | gateway | Step2Gateway | No | gateway URL (ping required) |
| 3 | providers | Step3Providers | No (≥1 key) | AiPipe key store |
| 4 | routing | Step4Routing | Yes | smartRoutingEnabled flag |
| 5 | telegram | Step5Telegram | Yes | TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID |
| 6 | agents | Step6Agents | Yes | agent_roles rows |
| 7 | notifications | Step7Notifications | Yes | notification preferences |
| 8 | complete | Step8Complete | — | wizard_state.completedSteps |
