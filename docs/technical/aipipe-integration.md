---
title: "AiPipe Integration: Technical Reference"
description: "AiPipe HTTP client, proxy routes, per-tenant key store, and Go service configuration."
---

# AiPipe Integration: Technical Reference

## Architecture

```
Browser/Agent
    │
    ▼
MC API (/api/aipipe/*)       ← auth gate (resolveTenantId + X-Tenant-ID)
    │
    ▼
src/lib/aipipe.ts            ← thin HTTP client
    │
    ▼
AiPipe service               ← 127.0.0.1:8082 (systemd user service)
    │
    ├─► Anthropic /v1/messages      (claude-haiku, sonnet, opus)
    ├─► OpenAI   /v1/chat/completions  (gpt-4o-mini, gpt-4.1)
    ├─► Google   /v1/chat/completions  (gemini-2.0-flash, gemini-2.0-pro)
    ├─► xAI      /v1/chat/completions  (grok-4, grok-4-1-fast-*)
    ├─► OpenRouter /v1/chat/completions (unified gateway, 200+ models)
    ├─► MiniMax  /v1/text/chatcompletion (abab6.5s-chat)
    └─► Kimi     /v1/chat/completions   (moonshot-v1-8k, -32k)
```

## Files

| Path | Purpose |
|------|---------|
| `src/lib/aipipe.ts` | AiPipe HTTP client: `aipipeHealthy()`, `aipipeStats()`, `aipipeProxyChat()`, `aipipeProxyMessages()`, `estimateSavingsPercent()` |
| `src/app/api/aipipe/health/route.ts` | GET, liveness probe |
| `src/app/api/aipipe/stats/route.ts` | GET, runtime stats + savingsPercent |
| `src/app/api/aipipe/proxy/chat/route.ts` | POST, OpenAI-compatible proxy |
| `src/app/api/aipipe/proxy/messages/route.ts` | POST, Anthropic-compatible proxy |
| `src/components/AiPipeWidget.tsx` | Client component, stats widget with 30s polling |
| `src/app/dashboard/connect/page.tsx` | Step 4 of wizard, AiPipe health check + explanation |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `AIPIPE_URL` | `http://127.0.0.1:8082` | AiPipe service base URL |

Set in `.env.local`. AiPipe must be accessible from the Next.js server process (not the browser).

## AiPipe Service

- **Binary**: `/home/openclaw/.local/bin/aipipe` (Go, stdlib-only)
- **Systemd unit**: `~/.config/systemd/user/aipipe.service`
- **Env file**: `~/.config/aipipe/env` (mode 600, contains API keys)
- **Listen**: `127.0.0.1:8082` (loopback only, not public)
- **Workers**: 8 (configurable via `AIPIPE_WORKERS`)

Start/stop:
```bash
systemctl --user start aipipe
systemctl --user stop aipipe
systemctl --user status aipipe
```

## Routing Algorithm (Router v2)

### Complexity Scoring (`util/scorer.go`)

Five-signal weighted pipeline, returns score in [0.05, 1.0]:

| Signal | Weight | Description |
|--------|--------|-------------|
| Length | 0.30 | Token estimate normalised to 8K tokens |
| Code | 0.25 | Code block detection; language-aware (rust/go/cpp/zig > bash/json/yaml) |
| Keyword | 0.25 | Categorised keywords with signed weights + complexity floor |
| Structural | 0.10 | Multi-part questions, numbered lists, headers |
| Depth | 0.10 | Multi-turn conversation depth (1 turn → 0.10, 8+ turns → 1.0) |

**Keyword complexity floor**: high-confidence category matches guarantee a minimum routing tier regardless of length/code:
- `proof/theorem/formal` (weight 0.90) → floor 0.78 (Sonnet+)
- `architecture/security` (weight 0.75-0.80) → floor 0.68 (Sonnet)
- `analysis/debug` (weight 0.60) → floor 0.52 (mid-tier)

### Model Selection (`model/models.go`)

`PickFor(PickRequest)` applies a four-stage filter + sort:

1. **Context window guard** — exclude models where `MaxContextWindow < request.TotalContext`
2. **Complexity fit** — include only models where `MaxComplexity >= request.Complexity`. If none qualify, all models are candidates (fallback).
3. **Quality gate** — filter to models with `effectiveSuccessRate >= 0.95`. If none pass, use all complexity-fit models.
4. **Quality-adjusted cost sort** — sort remaining candidates by:

```
adjustedCost = rawCost / qualityScore ^ qualityExponent
qualityExponent = max(0, complexity - 0.25) × 6
```

At **low complexity** (< 0.25): `qualityExponent = 0`, adjustedCost = rawCost — pure cheapest-wins.  
At **high complexity**: quality scores exponentially discount better models' effective cost, promoting quality over price.

For **streaming requests**: add `rawCost × ttftFactor` before sorting, where `ttftFactor ∈ [0, 0.30]` based on each model's observed TTFT EMA.

**TTFT tracking**: per-model exponential moving average (α=0.15) stored as `atomic.Int64` (µs × 1000), updated via lock-free CAS loop.

**Penalty decay**: success rate tracks per-model error rates. `429`/`5xx` add penalty (+2); `4xx` add +1. Effective success rate = `successRate - penalty × 0.02`. Penalty decays −1 every 30s via background goroutine.

## API Routes

### GET /api/aipipe/health

Auth required. Returns:
- `200 {"status":"ok"}`, AiPipe reachable
- `503 {"status":"unavailable"}`, AiPipe unreachable
- `401`, unauthenticated

### GET /api/aipipe/stats

Auth required. Returns AiPipe `/v1/stats` response plus:
- `savingsPercent`, estimated % cost reduction vs. always using GPT-4o (blended $6.25/M tokens)

### POST /api/aipipe/proxy/chat

Auth required. Zod-validated (`ChatRequestSchema`):
- `messages`, array of `{role: "system"|"user"|"assistant", content: string}`, 1–500 items
- `model`, `max_tokens`, `stream`, `temperature`, optional

Proxies to AiPipe `/v1/chat/completions`. Streams passthrough if upstream streams.

### POST /api/aipipe/proxy/messages

Auth required. Zod-validated (`MessagesRequestSchema`):
- `messages`, array of `{role: "user"|"assistant", content: string}`, 1–500 items
- `system`, `model`, `max_tokens`, `stream`, `temperature`, optional

Proxies to AiPipe `/v1/messages`.

## Timeouts

| Context | Timeout |
|---------|---------|
| Health check | 5s |
| Stats fetch | 5s |
| Proxy (chat/messages) | 120s |

## Error Handling

- AiPipe unreachable → `503 {"error":"AiPipe unavailable"}` from MC API
- Invalid request body → `400 {"error":"<field>: <zod message>"}` before hitting AiPipe
- AiPipe upstream error → status + body forwarded as-is to caller

## Savings Estimate Formula

```
baselineReqCost = totalRequests * 500 tokens * $6.25/1M
savingsPercent  = (baselineReqCost - actualCost) / baselineReqCost * 100
```

Clamped to [0%, 99%]. Only meaningful after a reasonable request volume (≥ ~100 requests). The $6.25/1M baseline reflects the blended cost of always using a frontier model (GPT-4o tier).

## Per-Tenant Key Store

AiPipe maintains a SQLite database of per-tenant API keys (`~/.config/aipipe/tenants.db`). Keys are injected via:

```
POST /v1/tenants/{id}/providers
{ "name": "anthropic", "key": "sk-ant-..." }
```

MC syncs tenant keys automatically on wizard save (wizard step 3). The `X-Tenant-ID` header (injected by MC API) tells AiPipe which tenant's key pool to route through. Cost and token stats are tracked per tenant.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIPIPE_URL` | `http://127.0.0.1:8082` | AiPipe service base URL |
| `ANTHROPIC_API_KEY` | — | Global Anthropic key (tenant keys take precedence) |
| `OPENAI_API_KEY` | — | Global OpenAI key |
| `GEMINI_API_KEY` | — | Google Gemini key |
| `XAI_API_KEY` | — | xAI Grok key |
| `OPENROUTER_API_KEY` | — | OpenRouter unified gateway key |
| `MINIMAX_API_KEY` | — | MiniMax key |
| `KIMI_API_KEY` | — | Kimi/Moonshot key |
| `AIPIPE_WORKERS` | `8` | Request worker pool size |

Set global keys in `~/.config/aipipe/env` (mode 600). Per-tenant keys override global keys for that tenant's requests.
