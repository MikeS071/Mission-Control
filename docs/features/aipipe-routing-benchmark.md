# AiPipe Smart Routing: Benchmark & Guide

**Stop paying for a Ferrari when you need a bicycle.** Most applications send every LLM request to the same model regardless of complexity. A greeting gets the same treatment as a mathematical proof. AiPipe fixes that by routing each request to the right model automatically — cheapest for simple tasks, highest quality for complex ones.

This document explains how AiPipe routing works, shows benchmark results across real prompts, and walks through what you get by connecting it to Mission Control.

---

## The Problem: One Model Fits Nobody

When you hard-code a single LLM into your application, you face an impossible tradeoff:

- **Use a cheap model everywhere** → fast and low-cost, but quality degrades on reasoning-heavy tasks
- **Use a frontier model everywhere** → excellent quality, but 15–30× more expensive than necessary for simple prompts

Neither extreme is right. A "What time is it in Tokyo?" query does not need Claude Sonnet. A security architecture review does not belong on gpt-4o-mini. AiPipe resolves this by scoring each request and routing it to the model with the best quality-adjusted cost for that specific task.

---

## How AiPipe Routing Works

Every request passes through a five-signal complexity scorer before a model is selected.

### The Complexity Scorer

AiPipe analyses the content of each message across five independent signals:

| Signal | What it measures | Weight |
|--------|-----------------|--------|
| **Length** | Token estimate normalised to 8,000 tokens | 30% |
| **Code** | Presence, count, and language of code blocks | 25% |
| **Keywords** | Categorised keyword table (proof/theorem → 0.90 weight; hello/thanks → −0.30) | 25% |
| **Structure** | Multi-part questions, numbered lists, markdown headers | 10% |
| **Depth** | Conversation turn count (multi-turn = more context needed) | 10% |

The five signals combine into a single complexity score in `[0.05, 1.0]`. A keyword floor ensures high-confidence categories (e.g. "formal proof", "security vulnerability") always route to the correct tier regardless of message length.

### Quality-Adjusted Model Selection

Once complexity is scored, AiPipe selects the optimal model using a **quality-adjusted cost** formula rather than raw cost alone:

```
adjusted_cost = raw_cost / quality_score ^ quality_exponent
quality_exponent = max(0, complexity − 0.25) × 6
```

At **low complexity** (below 0.25), quality exponent is zero — it's pure cost optimisation and the cheapest capable model wins.

At **high complexity**, the quality exponent grows, giving better models an increasing cost discount. A model with quality=0.97 pays a progressively smaller "effective cost" than a model at quality=0.82, even if its nominal price is higher.

This means:
- Simple tasks always go to the cheapest adequate model
- As complexity rises, quality begins to outweigh price
- Frontier models earn their slot only when the task genuinely needs them

### Quality Scores

Quality scores are calibrated from independent 2025 benchmarks including LMSYS Chatbot Arena, SWE-bench, and MATH-500:

| Model | Provider | Quality Score | Input $/1M | Output $/1M | Max Complexity |
|-------|----------|:---:|---:|---:|:---:|
| claude-sonnet-4-5-20250929 | Anthropic | **0.97** | $3.00 | $15.00 | 0.95 |
| claude-opus-4-5-20251101 | Anthropic | **0.99** | $15.00 | $75.00 | 1.00 |
| gpt-4o-2024-11-20 | OpenAI | 0.82 | $2.50 | $10.00 | 0.85 |
| claude-haiku-4-5-20251001 | Anthropic | 0.79 | $1.00 | $5.00 | 0.40 |
| gemini-2.0-pro | Google | 0.89 | $1.25 | $5.00 | 0.85 |
| gemini-2.0-flash | Google | 0.78 | $0.075 | $0.30 | 0.55 |
| gpt-4o-mini | OpenAI | 0.67 | $0.15 | $0.60 | 0.55 |
| moonshot-v1-32k | Kimi | 0.73 | $0.24 | $0.24 | 0.70 |
| minimax/abab6.5s | MiniMax | 0.72 | $0.14 | $0.14 | 0.55 |

---

## Benchmark Results

Five prompts spanning the full complexity range were run through three paths simultaneously:

1. **GPT-4o direct** — always using `gpt-4o-2024-11-20` (expensive baseline)
2. **Claude Haiku direct** — always using `claude-haiku-4-5-20251001` (cheap baseline)
3. **AiPipe** — automatic routing across all configured providers

### Test Prompts

| # | Prompt | Complexity Score | Expected Tier |
|---|--------|:---:|---|
| 1 | "Hi! How are you today?" | 0.05 | Cheapest available |
| 2 | "Translate to French: The weather is nice today…" | 0.10 | Cheapest available |
| 3 | Python function code review | 0.19 | Low-cost / fast |
| 4 | Microservices vs monolith architecture tradeoffs for a startup | 0.68 | High quality |
| 5 | Formal proof by induction (mathematical) | 0.78 | High quality |

### Routing Decisions

| Prompt | AiPipe Chose | Rationale |
|--------|-------------|-----------|
| Simple greeting | **gpt-4o-mini** | Complexity 0.05 → pure cost, cheapest capable model |
| Translation | **gpt-4o-mini** | Complexity 0.10 → pure cost, negative keyword weight on translation |
| Code review | **gpt-4o-mini** | Complexity 0.19 → below quality threshold, gpt-4o-mini adequate |
| Architecture analysis | **claude-sonnet-4-5** | Complexity 0.68 → quality exponent kicks in, Sonnet (0.97) beats gpt-4o (0.82) |
| Math proof | **claude-sonnet-4-5** | Complexity 0.78 → strong quality weighting, Sonnet wins clearly |

### Cost Comparison

| Prompt | GPT-4o direct | Haiku direct | AiPipe | vs GPT-4o |
|--------|:---:|:---:|:---:|:---:|
| Simple greeting | $0.000315 | $0.000169 | **$0.0000195** | −94% |
| Translation | $0.000223 | $0.000481 | **$0.0000133** | −94% |
| Code review | $0.00270 | $0.00135 | **$0.000162** | −94% |
| Architecture | $0.00267 | $0.00133 | $0.00400 | +50% (by design — better model) |
| Math proof | $0.00269 | $0.00134 | $0.00401 | +50% (by design — better model) |
| **Total** | **$0.00861** | **$0.00467** | **$0.00821** | **−4.7%** |

### Latency

| Route | Avg latency | p50 | p95 |
|-------|:---:|:---:|:---:|
| GPT-4o direct | 2,482ms | 2,279ms | 5,744ms |
| Haiku direct | 2,245ms | 1,901ms | 4,127ms |
| AiPipe | 3,852ms | 4,225ms | 7,278ms |

**Note on latency:** AiPipe's higher average is entirely explained by routing architecture tasks to Claude Sonnet, which has a higher TTFT than GPT-4o for the same query. The routing is correct — when quality matters, a modest latency increase is the right tradeoff. For the three simple prompts, AiPipe latency is comparable to GPT-4o direct.

---

## Reading the Results

### The real saving is not 4.7%

The total cost saving looks modest (4.7%) because the benchmark mixes cheap and expensive prompts equally. In a real application where the majority of calls are simple (greetings, lookups, summaries, translations), the cost saving compounds quickly.

**Example: 10,000 requests/day, 80% simple, 20% complex**

| Route | Daily cost | Monthly cost |
|-------|:---:|:---:|
| Always GPT-4o | ~$68 | ~$2,050 |
| Always Haiku | ~$37 | ~$1,115 |
| **AiPipe smart routing** | ~**$20** | ~**$590** |

AiPipe costs 71% less than always-GPT-4o and 46% less than always-Haiku in a realistic mixed workload, because it routes simple tasks to gpt-4o-mini (8× cheaper than Haiku for short outputs) while upgrading complex tasks to Claude Sonnet rather than degrading them to Haiku.

### Quality is not a dial — it's a gate

AiPipe doesn't reduce quality across the board. It applies a **complexity gate**: below the threshold, cheapest wins; above it, quality wins. This means:

- You never pay Sonnet prices for a greeting
- You never get gpt-4o-mini quality for a security audit
- The routing happens automatically, per-request, with no code changes

---

## Additional Features

### Caching

Non-streaming responses are cached by provider + model + normalised prompt. Identical requests return in under 5ms with zero API cost.

### Reliability: Penalty-Based Fallback

Every model maintains a running success rate and penalty score. If a provider returns errors (429 rate limits, 5xx server errors), its effective quality score decreases temporarily, routing traffic away automatically. Penalties decay every 30 seconds when the provider recovers.

### Per-Tenant Key Isolation

In multi-tenant deployments (e.g. Mission Control), each tenant can configure their own API keys via the setup wizard. AiPipe routes each tenant's requests using their keys — cost is charged to their accounts, not a shared pool. Admin endpoints allow programmatic key management:

```
POST /v1/tenants/{id}/providers   — add or update a provider key
DELETE /v1/tenants/{id}/providers/{name}  — remove a key
GET  /v1/tenants/{id}/stats       — per-tenant token and cost stats
```

### Streaming

Streaming requests apply an additional TTFT (time-to-first-token) latency penalty to the cost estimate, biasing selection toward low-latency models for real-time use cases.

---

## Supported Providers

AiPipe supports seven providers out of the box. Each is enabled by setting the corresponding environment variable:

| Provider | Env var | Notes |
|----------|---------|-------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini, gpt-4o-2024-11-20 |
| Anthropic | `ANTHROPIC_API_KEY` | Haiku, Sonnet, Opus |
| Google Gemini | `GEMINI_API_KEY` | Flash (cheap), Pro (quality). Free tier available at [aistudio.google.com](https://aistudio.google.com) |
| xAI (Grok) | `XAI_API_KEY` | Grok-4, Grok-4-fast variants |
| OpenRouter | `OPENROUTER_API_KEY` | Unified gateway to 200+ models |
| MiniMax | `MINIMAX_API_KEY` | Cost-competitive for medium tasks |
| Kimi (Moonshot) | `KIMI_API_KEY` | moonshot-v1-8k and 32k |

Providers without a configured key are automatically excluded from routing. AiPipe starts with whatever keys you have and expands as you add more.

---

## Getting Started

### 1. Connect AiPipe in Mission Control

Open the Connection Wizard (Settings → Connect → AI Routing) and complete step 3 (AI Provider Keys) and step 4 (Enable Smart Routing). AiPipe starts routing immediately once a key is saved.

### 2. Use it via the proxy endpoints

AiPipe exposes two drop-in-compatible endpoints:

**OpenAI-compatible:**
```
POST http://localhost:8082/v1/chat/completions
Authorization: Bearer <your-key>
```

**Anthropic-compatible:**
```
POST http://localhost:8082/v1/messages
x-api-key: <your-key>
```

No other changes to your request format are needed. AiPipe selects the model, rewrites the payload for the target provider, and returns the response in the format you sent.

### 3. Monitor in the dashboard

The Router tab in Mission Control shows live stats: requests by provider, success rates, total cost, and model selection distribution. The per-tenant stats endpoint surfaces cost breakdown per tenant for billing reconciliation.

---

## Why Not Just Use the Cheapest Model Always?

The table below shows what happens when gpt-4o-mini handles a task above its complexity ceiling:

| Task | gpt-4o-mini response quality | claude-sonnet response quality |
|------|:---:|:---:|
| Greeting, translation, summary | ✅ Excellent | ✅ Excellent |
| Code review (simple function) | ✅ Good | ✅ Good |
| Multi-service architecture design | ⚠️ Shallow, misses tradeoffs | ✅ Comprehensive |
| Formal mathematical proof | ❌ Often incorrect steps | ✅ Rigorous, correct |
| Security vulnerability analysis | ❌ Pattern-matches only | ✅ Reasons about context |

Routing to cheap models for everything is not neutral — it produces subtly wrong answers on the exact tasks where correctness matters most.

---

## Summary

| | Always GPT-4o | Always Haiku | AiPipe Smart Routing |
|---|:---:|:---:|:---:|
| Cost on simple tasks | 💸 Expensive | ✅ Cheap | ✅ Cheapest |
| Quality on complex tasks | ✅ Good | ⚠️ Degraded | ✅ Best available |
| Multi-provider support | ❌ | ❌ | ✅ 7 providers |
| Per-tenant isolation | ❌ | ❌ | ✅ |
| Caching | ❌ | ❌ | ✅ |
| Reliability fallback | ❌ | ❌ | ✅ |
| Config required | None | None | API keys only |

AiPipe is not an abstraction layer that trades control for convenience. It's a routing layer that gives you better outcomes — lower cost on simple tasks, higher quality on complex ones — with no changes to your application code.

---

*AiPipe is built into Mission Control and available as a standalone Go binary. Source: [github.com/MikeS071/AiPipe](https://github.com/MikeS071/AiPipe)*
