# AiPipe Integration

AiPipe is an on-device LLM router that automatically selects the most cost-effective model for each request, reducing AI spend without changing how agents work.

## What it does

- **Smart routing** — scores each request's complexity (length, code presence, keyword category, conversation depth) and picks the cheapest model that can handle it
- **Multi-provider** — routes across OpenAI, Anthropic, xAI (Grok), OpenRouter, MiniMax, Kimi, and Gemini based on cost and capability
- **TTFT-aware streaming** — for streaming calls, models with high time-to-first-token are penalised in selection
- **Context window guard** — excludes models whose max context window is smaller than the request's total token count
- **Caching** — identical requests return cached responses instantly
- **Stats dashboard** — live view of requests routed, cost saved vs GPT-4o, cache hit rate, provider breakdown (per-tenant isolated)

## Dashboard

The **⚡ Router** tab on the dashboard shows:
- Total requests routed
- Estimated cost savings vs always using GPT-4o
- Cache hit percentage
- Queue depth and p50 latency
- Provider breakdown bar chart
- Top model used

The widget refreshes every 30 seconds automatically.

## Setup Wizard

Step 4 of the connection wizard ("Enable Smart Routing") checks whether AiPipe is running and explains how it uses your existing API keys from Step 3. The step is always skippable — AiPipe is optional.

## Using the proxy

Your agents can route through AiPipe via the Mission Control API:

```
POST /api/aipipe/proxy/chat      # OpenAI-compatible
POST /api/aipipe/proxy/messages  # Anthropic-compatible
```

All proxy routes require authentication (Bearer token or session cookie). Invalid request bodies return 400 with a Zod validation message.

## Health check

```
GET /api/aipipe/health
```

Returns `{"status":"ok"}` when AiPipe is reachable, or `{"status":"unavailable"}` with HTTP 503 when it is not.

## Availability

AiPipe is optional — if the service is not running, the health endpoint returns 503 and the dashboard widget shows an offline state with a retry button. All other dashboard features continue to work normally.
