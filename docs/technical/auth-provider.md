---
title: "Technical: AI Provider Auth & Per-Tenant Routing"
---

# Technical: AI Provider Auth & Per-Tenant Routing

## Architecture Overview

Provider API keys are stored in two places:
1. **MC Database** — `tenantSettings.settings` JSON column (per-tenant, Postgres)
2. **AiPipe SQLite store** — `~/.config/aipipe/aipipe.db` (per-tenant, local)

The two stores are kept in sync: whenever a tenant saves provider keys via the settings API, MC calls the AiPipe admin endpoints to mirror the keys to the local store. The AiPipe process uses its own store as the authoritative source for routing decisions.

## AiPipe SQLite Schema

File: `~/.config/aipipe/aipipe.db` (permissions: 0600)

```sql
CREATE TABLE tenants (
  id         TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE provider_keys (
  tenant_id  TEXT NOT NULL,
  provider   TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, provider)
);

CREATE TABLE stats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  requests    INTEGER DEFAULT 0,
  in_tokens   INTEGER DEFAULT 0,
  out_tokens  INTEGER DEFAULT 0,
  cost_usd    REAL DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## AiPipe Internal Packages

```
internal/tenant/
  store.go    — SQLite CRUD: Open, UpsertProviderKey, GetProviderKeys,
                DeleteProviderKey, ListTenants, RecordStats, GetStats
  manager.go  — in-memory key cache (TTL 60s, thread-safe), delegates to store
```

`Manager.ResolveKeys(tenantID)` is called on every proxied request. Cache TTL is 60 seconds; `InvalidateCache(tenantID)` is called immediately after any key upsert/delete.

## AiPipe Admin Endpoints

All admin endpoints require `X-Admin-Secret` header matching `AIPIPE_ADMIN_SECRET` env var. Returns 401 without it.

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/tenants/{id}/providers` | Upsert a provider key. Body: `{"provider":"openai","api_key":"sk-..."}` |
| `DELETE` | `/v1/tenants/{id}/providers/{name}` | Remove a provider key |
| `GET` | `/v1/tenants/{id}/stats` | Per-tenant stats snapshot |
| `GET` | `/v1/tenants` | List all tenant IDs (admin) |

AiPipe binds to `127.0.0.1:8082` — not publicly exposed. MC calls these endpoints server-side only.

## Per-Tenant Request Routing Flow

```
1. Client → MC API /api/aipipe/proxy/chat
2. MC resolves tenantId from session
3. MC calls aipipeProxyChat(body, tenantId)
   → sets X-Tenant-ID: {tenantId} header
4. AiPipe receives request, extracts X-Tenant-ID
5. manager.ResolveKeys(tenantID) → returns map[provider]apiKey
6. Registry filtered to providers with a key for this tenant
7. PickFor(complexity, tokens) → selects cheapest capable model
8. processJob uses tenant key (or falls back to global env-var key)
9. Upstream call to provider with tenant's key
10. stats.RecordTenantCall(tenantID, ...) → written to SQLite
```

### Key Fallback Chain

```
tenant key (from SQLite store)
  → global env-var key (OPENAI_API_KEY, etc.)
    → skip provider (not available for this request)
```

If `X-Tenant-ID` is absent, AiPipe falls back to global env-var keys only (host-operator mode — backward compatible).

## New Providers

All new providers use the OpenAI-compatible chat completions format. No new response translation was required.

| Provider | Constant | Base URL | Env Var |
|---|---|---|---|
| OpenRouter | `ProviderOpenRouter` | `https://openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` |
| MiniMax | `ProviderMiniMax` | `https://api.minimax.chat/v1/chat/completions` | `MINIMAX_API_KEY` |
| Kimi (Moonshot) | `ProviderKimi` | `https://api.moonshot.cn/v1/chat/completions` | `KIMI_API_KEY` |
| Gemini | `ProviderGemini` | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `GEMINI_API_KEY` |

OpenRouter additionally sets `HTTP-Referer: https://archonhq.ai` and `X-Title: AiPipe` headers for rate-limit attribution.

## MC↔AiPipe Key Sync

**Trigger:** `POST /api/settings` whenever any provider key field is present in the request body.

**Implementation** (`src/app/api/settings/route.ts`):
```typescript
const hasProviderKeys = PROVIDER_KEY_FIELDS.some((f) => Boolean(incoming[f]));
if (hasProviderKeys) {
  aipipeSyncTenantKeys(tenantId, keyMap).catch(/* log, non-fatal */);
}
```

Sync is fire-and-forget — failure does not fail the settings save. The MC DB is the source of truth; AiPipe store is a performance cache.

**`aipipeSyncTenantKeys`** fans out to `POST /v1/tenants/{id}/providers` for each non-empty key, using `Promise.allSettled` (individual failures don't block others).

## Per-Tenant Stats

**MC stats endpoint** (`GET /api/aipipe/stats`) fetches in parallel:
- Global: `GET /v1/stats` — model health, latency percentiles, queue depth
- Per-tenant: `GET /v1/tenants/{id}/stats` — this tenant's requests, tokens, cost

Response shape:
```typescript
{
  ...AiPipeStats,           // global model tracking, runtime, queue
  savingsPercent: number,   // estimated savings vs GPT-4o baseline
  tenant: TenantStatsSnapshot | null  // null if no data or admin secret missing
}
```

`TenantStatsSnapshot`:
```typescript
{
  tenant_id: string;
  requests:  number;
  in_tokens:  number;
  out_tokens: number;
  cost_usd:   number;
  updated_at: string;
}
```

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `AIPIPE_ADMIN_SECRET` | `~/.config/aipipe/env` + MC `.env.local` | Shared secret for admin endpoints |
| `AIPIPE_DB_PATH` | `~/.config/aipipe/env` | SQLite path (default: `~/.config/aipipe/aipipe.db`) |
| `OPENROUTER_API_KEY` | `~/.config/aipipe/env` | OpenRouter global key (optional; tenant key takes precedence) |
| `MINIMAX_API_KEY` | `~/.config/aipipe/env` | MiniMax global key |
| `KIMI_API_KEY` | `~/.config/aipipe/env` | Kimi/Moonshot global key |
| `GEMINI_API_KEY` | `~/.config/aipipe/env` | Google Gemini global key |

## Security Notes

- AiPipe admin endpoints are bound to localhost only — no public exposure
- SQLite DB file is `chmod 0600` — owner read/write only
- API keys are stored in plaintext in SQLite (at-rest encryption via filesystem permissions)
- Full key vault (AES-256 at-rest encryption) is roadmap
- `AIPIPE_ADMIN_SECRET` is generated via `openssl rand -hex 32` and stored in `pass`
