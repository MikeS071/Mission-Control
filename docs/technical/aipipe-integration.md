# AiPipe Integration — Technical Reference

## Architecture

```
Browser/Agent
    │
    ▼
MC API (/api/aipipe/*)       ← auth gate (resolveTenantId)
    │
    ▼
src/lib/aipipe.ts            ← thin HTTP client
    │
    ▼
AiPipe service               ← 127.0.0.1:8082 (systemd user service)
    │
    ├─► OpenAI   /v1/chat/completions
    ├─► Anthropic /v1/messages
    └─► xAI      /v1/chat/completions
```

## Files

| Path | Purpose |
|------|---------|
| `src/lib/aipipe.ts` | AiPipe HTTP client: `aipipeHealthy()`, `aipipeStats()`, `aipipeProxyChat()`, `aipipeProxyMessages()`, `estimateSavingsPercent()` |
| `src/app/api/aipipe/health/route.ts` | GET — liveness probe |
| `src/app/api/aipipe/stats/route.ts` | GET — runtime stats + savingsPercent |
| `src/app/api/aipipe/proxy/chat/route.ts` | POST — OpenAI-compatible proxy |
| `src/app/api/aipipe/proxy/messages/route.ts` | POST — Anthropic-compatible proxy |
| `src/components/AiPipeWidget.tsx` | Client component — stats widget with 30s polling |
| `src/app/dashboard/connect/page.tsx` | Step 4 of wizard — AiPipe health check + explanation |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `AIPIPE_URL` | `http://127.0.0.1:8082` | AiPipe service base URL |

Set in `.env.local`. AiPipe must be accessible from the Next.js server process (not the browser).

## AiPipe Service

- **Binary**: `/home/openclaw/.local/bin/aipipe` (Go, stdlib-only)
- **Systemd unit**: `~/.config/systemd/user/aipipe.service`
- **Env file**: `~/.config/aipipe/env` (mode 600 — contains API keys)
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

`PickFor(PickRequest)` selects the cheapest model that:
1. Has `MaxComplexity >= request.Complexity`
2. Has `MaxContextWindow >= request.TotalContext` (context window guard)
3. Has lowest `effectiveCost = baseCost * (1 + ttftPenalty)` where ttftPenalty applies only for `stream=true`

TTFT (time-to-first-token) per model is tracked via exponential moving average (EMA, α=0.15) using lock-free `atomic.Int64` CAS loop.

## API Routes

### GET /api/aipipe/health

Auth required. Returns:
- `200 {"status":"ok"}` — AiPipe reachable
- `503 {"status":"unavailable"}` — AiPipe unreachable
- `401` — unauthenticated

### GET /api/aipipe/stats

Auth required. Returns AiPipe `/v1/stats` response plus:
- `savingsPercent` — estimated % cost reduction vs. always using GPT-4o (blended $6.25/M tokens)

### POST /api/aipipe/proxy/chat

Auth required. Zod-validated (`ChatRequestSchema`):
- `messages` — array of `{role: "system"|"user"|"assistant", content: string}`, 1–500 items
- `model`, `max_tokens`, `stream`, `temperature` — optional

Proxies to AiPipe `/v1/chat/completions`. Streams passthrough if upstream streams.

### POST /api/aipipe/proxy/messages

Auth required. Zod-validated (`MessagesRequestSchema`):
- `messages` — array of `{role: "user"|"assistant", content: string}`, 1–500 items
- `system`, `model`, `max_tokens`, `stream`, `temperature` — optional

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

Clamped to [0%, 99%]. Only meaningful after a reasonable request volume.
