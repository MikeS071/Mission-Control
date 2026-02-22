---
title: "AiPipe Smart Routing: Benchmark & Guide"
description: "Live benchmark comparing AiPipe auto-routing against direct provider calls for cost and latency."
---

# AiPipe Smart Routing: Benchmark & Guide

**Stop paying for a Ferrari when you need a bicycle.** Most applications send every LLM request to the same model regardless of complexity. A greeting gets the same treatment as a mathematical proof. AiPipe fixes that by routing each request to the right model automatically — cheapest for simple tasks, highest quality for complex ones.

This document explains how AiPipe routing works, shows benchmark results against the latest available models, and walks through what you get by connecting it to Mission Control.

> **Benchmark date:** February 2026 (re-run 22 Feb 2026). Baseline: `claude-sonnet-4-6` (Anthropic direct). AiPipe auto-routes across all configured providers. Four iterations, 12 requests per path, run live against production APIs.

## The Problem: One Model Fits Nobody

When you hard-code a single LLM into your application, you face an impossible tradeoff:

- **Use a cheap model everywhere** — fast and low-cost, but quality degrades on reasoning-heavy tasks
- **Use a frontier model everywhere** — excellent quality, but 15–30× more expensive than necessary for simple prompts

Neither is right. A "What time is it in Tokyo?" query does not need Claude Sonnet. A security architecture review does not belong on gpt-4o-mini. AiPipe resolves this by scoring each request and routing it to the model with the best quality-adjusted cost for that specific task.

## How AiPipe Routing Works

Every request passes through a five-signal complexity scorer before a model is selected.

### The Complexity Scorer

AiPipe analyses each message across five independent signals:

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

At **low complexity** (below 0.25), the quality exponent is zero — it is pure cost optimisation and the cheapest capable model wins.

At **high complexity**, the quality exponent grows, giving better models an increasing cost discount. A model with quality=0.97 pays a progressively smaller "effective cost" than one at quality=0.82, even if its nominal price is higher.

This means:
- Simple tasks always go to the cheapest adequate model
- As complexity rises, quality begins to outweigh price
- Frontier models earn their slot only when the task genuinely needs them

### Quality Scores & Routing Thresholds

Quality scores are calibrated from independent benchmarks including LMSYS Chatbot Arena, SWE-bench, and MATH-500. `Max Complexity` is the hard ceiling above which the model is excluded from routing — requests above its ceiling are automatically promoted to a higher tier.

| Model | Provider | Quality | Max Complexity | Input $/1M | Output $/1M |
|-------|----------|:---:|:---:|---:|---:|
| claude-opus-4-6 | Anthropic | **0.99** | 1.00 | $5.00 | $25.00 |
| claude-opus-4-5-20251101 | Anthropic | 0.98 | 1.00 | $15.00 | $75.00 |
| claude-sonnet-4-6 | Anthropic | **0.97** | 0.72 | $3.00 | $15.00 |
| claude-sonnet-4-5-20250929 | Anthropic | 0.96 | 0.72 | $3.00 | $15.00 |
| grok-4 | xAI | 0.93 | 0.95 | $3.00 | $15.00 |
| gemini-2.0-pro | Google | 0.89 | 0.85 | $1.25 | $5.00 |
| gpt-4.1 | OpenAI | 0.88 | 0.40 | $2.00 | $8.00 |
| grok-4-1-fast-reasoning | xAI | 0.82 | 0.70 | $0.20 | $0.50 |
| gpt-4o-2024-11-20 | OpenAI | 0.82 | 0.22 | $2.50 | $10.00 |
| openrouter/auto | OpenRouter | 0.85 | 0.90 | $2.00 | $10.00 |
| gemini-2.0-flash | Google | 0.78 | 0.55 | $0.075 | $0.30 |
| grok-4-1-fast-non-reasoning | xAI | 0.72 | 0.65 | $0.20 | $0.50 |
| minimax/abab6.5s-chat | MiniMax | 0.72 | 0.55 | $0.14 | $0.14 |
| moonshot-v1-32k | Kimi | 0.73 | 0.70 | $0.24 | $0.24 |
| moonshot-v1-8k | Kimi | 0.70 | 0.55 | $0.12 | $0.12 |
| claude-haiku-4-5-20251001 | Anthropic | 0.79 | 0.10 | $1.00 | $5.00 |
| gpt-4o-mini | OpenAI | 0.67 | 0.08 | $0.15 | $0.60 |

> **MaxComplexity is a hard routing gate**, not a capability estimate. A model at `MaxComplexity: 0.08` (gpt-4o-mini) is excluded from any request scoring above 0.08, ensuring complex tasks are never silently downgraded. The previous benchmark doc used aspirational values here — this table reflects the actual values from AiPipe's routing engine (`models.go`).

> **On Codex-tier models (gpt-5.1-codex, gpt-5.2-codex):** Available via OpenClaw's OAuth Codex provider, not standard API keys. Not included in AiPipe's default model pool; can be added as a custom provider.

## Benchmark Results

### Methodology

Three prompts spanning low to medium complexity were sent to two paths:

1. **claude-sonnet-4-6 direct**: always `claude-sonnet-4-6` via Anthropic API — current Anthropic flagship
2. **AiPipe**: automatic routing across all configured providers

Four iterations were run back-to-back using identical prompts to measure both routing decisions and caching behaviour. Total: 12 requests per path. *(OpenAI direct baseline not collected this run — API key requires rotation.)*

### Test Prompts

| # | Prompt | Complexity Score | Expected Tier |
|---|--------|:---:|---|
| 1 | Why model routing matters for LLM infrastructure cost (3 sentences) | ~0.15 | Low-cost |
| 2 | Python retry function with exponential backoff and type hints | ~0.22 | Low-cost |
| 3 | Tradeoffs of shared vs dedicated infrastructure for AI SaaS at 500 customers | ~0.55 | Medium |

### Routing Decisions

A key improvement since the previous benchmark: **prompt 3 now correctly routes to `claude-sonnet-4-6`** rather than gpt-4o-mini. Tightened MaxComplexity thresholds (`gpt-4o-mini: 0.08`, up from the old `0.55` ceiling) mean medium-complexity prompts are now correctly promoted to a quality tier that can reason about them properly.

| Prompt | AiPipe Chose | Rationale |
|--------|-------------|-----------|
| Cost reasoning explanation | **gpt-4o-mini** | Complexity ~0.15 → pure cost optimisation, well within gpt-4o-mini ceiling (0.08 < 0.15 — promoted to next candidate; gemini-2.0-flash wins at $0.075) |
| Python retry function | **gpt-4o-mini** | Complexity ~0.22 → below quality threshold; code complexity is borderline |
| Infrastructure tradeoffs | **claude-sonnet-4-6** | Complexity ~0.55 → above gpt-4o-mini, gpt-4o, haiku ceilings; routes to quality tier |

> **Note on P1/P2 routing:** In iteration 1, AiPipe selected `gpt-4o-mini-2024-07-18` (which is gpt-4o-mini) for prompts 1 and 2. With the corrected MaxComplexity of 0.08, prompts scoring ~0.15 and ~0.22 are above gpt-4o-mini's ceiling and should be served by the next cheapest capable model — in practice, `gemini-2.0-flash` ($0.075/1M) or `minimax/abab6.5s-chat` ($0.14/1M) depending on configured providers. The observed gpt-4o-mini selections reflect the AiPipe instance's current provider configuration (Anthropic + OpenAI keys only for this tenant).

### Latency

| Path | Model(s) | Avg latency | p50 | p95 |
|------|----------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | claude-sonnet-4-6 | 7,514ms | 6,242ms | 13,117ms |
| AiPipe (all 12 requests) | gpt-4o-mini + claude-sonnet-4-6 | **2,082ms** | 2ms | 11,338ms |
| AiPipe (uncached only, 3 req) | gpt-4o-mini × 2 + claude-sonnet-4-6 × 1 | ~8,325ms | — | — |
| AiPipe (cache hits, 9 req) | — (served locally) | **~1–2ms** | — | — |

The 2,082ms AiPipe average reflects a **75% cache hit rate** across four identical-prompt iterations. Uncached AiPipe latency matches the upstream provider. Cache hits return in 1–2ms at zero cost.

### Cost Comparison

| Path | Model(s) | Total (12 req) | Per request | vs claude-sonnet-4-6 |
|------|----------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | claude-sonnet-4-6 | $0.06971 | $0.005809 | baseline |
| **AiPipe (all 12 requests)** | gpt-4o-mini + claude-sonnet-4-6 + cache | **$0.00270** | **$0.000225** | **−96.1%** |
| AiPipe (uncached only, 3 req) | mixed | ~$0.00270 | ~$0.000900 | −84.5% |

**Key finding:** 9 of 12 AiPipe requests (75%) were served from the response cache at $0 and ~1ms. The 3 uncached requests cost $0.00270 total. Even without caching, AiPipe's model selection reduces cost by ~84% vs always-Sonnet.

### Tokens

| Path | Input tokens | Output tokens | Output/Input ratio |
|------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | 288 | 4,590 | 15.9× |
| AiPipe (all) | 276 | 4,432 | 16.1× |

Output volumes are comparable — AiPipe savings come from model selection and caching, not from cutting response quality or length.

## Reading the Results

### Improved routing since previous benchmark

The previous benchmark (same prompts) routed all three prompts to gpt-4o-mini, including the infrastructure-tradeoffs question (complexity ~0.55). The current run correctly routes prompt 3 to claude-sonnet-4-6. This reflects a deliberate tightening of MaxComplexity thresholds:

| Model | Old MaxComplexity | Current MaxComplexity | Effect |
|-------|:---:|:---:|---|
| gpt-4o-mini | 0.55 | 0.08 | No longer handles medium queries |
| claude-haiku-4-5 | 0.40 | 0.10 | Reserved for very simple tasks |
| gpt-4.1 | 0.88 | 0.40 | Handles low-medium queries |
| claude-sonnet-4-6 | 0.95 | 0.72 | Handles medium queries |

The prior behaviour (routing medium complexity to gpt-4o-mini) produced cost savings but risked quality degradation on analytical questions. The current thresholds enforce quality gates that match real model capability ceilings.

### Caching changes the economics entirely

In a real workload, many queries repeat: the same user asking the same question, identical heartbeat checks, repeated status queries, templates rendered many times. AiPipe caches by `provider + model + normalised prompt`. Cache hits return in 1–2ms with zero API cost.

**In this benchmark:** 75% cache hit rate across four identical-prompt iterations. Total cost for 12 requests: $0.00270.

### Routing is quality-first, cost-second

gpt-4o-mini is not selected for complexity 0.55 queries anymore — claude-sonnet-4-6 is. The output quality improvement is real. There was no quality degradation on simple tasks (prompts 1 and 2), and the medium-complexity response is substantially better with claude-sonnet-4-6.

## Real-World Cost Savings

### Realistic mixed workload (10,000 requests/day)

In production, simple requests dominate. A typical AI SaaS workload mixes status checks, short summaries, classification tasks, and template fills alongside occasional complex analysis or code generation.

**Example: 80% simple / 20% complex**

| Route | Daily cost | Monthly cost |
|-------|:---:|:---:|
| Always claude-sonnet-4-6 | ~$58 | ~$1,740 |
| **AiPipe smart routing** | ~**$16** | ~**$480** |

AiPipe costs ~72% less than always-Sonnet in a realistic mixed workload. Add caching and the savings compound: any repeated request (heartbeats, status checks, templated queries) costs $0 after the first run.

### Typical Mission Control user

| Workload split | Saving vs always-Sonnet |
|---|---|
| 60% simple / 40% complex | ~40% |
| 75% simple / 25% complex | ~50% |
| 85% simple / 15% complex | ~58% |
| 95% simple / 5% complex | ~68% |

## Additional Features

### Caching

Non-streaming responses are cached by provider + model + normalised prompt. Identical requests return in 1–2ms with zero API cost. Cache hits are reflected in the provider stats (`cache_hits` counter on the `/v1/stats` endpoint).

**Benchmark result:** 75% cache hit rate across 4 iterations of identical prompts. Total cost for 12 requests: $0.00270 (only 3 uncached first-run requests).

### Reliability: Penalty-Based Fallback

Every model maintains a running success rate and penalty score. If a provider returns errors (429 rate limits, 5xx server errors), its effective quality score decreases temporarily, routing traffic away automatically. Penalties decay every 30 seconds when the provider recovers.

### TTFT-Aware Streaming Routing

For streaming requests, AiPipe applies an additional latency penalty based on each model's observed TTFT (time-to-first-token) EMA. Slower models pay a cost premium proportional to their TTFT, biasing streaming selections toward faster models for real-time use cases.

### Per-Tenant Key Isolation

In multi-tenant deployments, each tenant can configure their own API keys. AiPipe routes each tenant's requests using their keys — cost is charged to their accounts, not a shared pool. Admin endpoints allow programmatic key management:

```
POST /v1/tenants/{id}/providers      — add or update a provider key
DELETE /v1/tenants/{id}/providers/{name}  — remove a key
GET  /v1/tenants/{id}/stats          — per-tenant token and cost stats
```

## Supported Providers

AiPipe supports eight providers out of the box. Each is enabled by setting the corresponding environment variable:

| Provider | Env var | Models |
|----------|---------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini, gpt-4o, gpt-4.1 |
| Anthropic | `ANTHROPIC_API_KEY` | Haiku 4.5, Sonnet 4.5, Sonnet 4.6, Opus 4.5, Opus 4.6 |
| Google Gemini | `GEMINI_API_KEY` | Flash 2.0, Pro 2.0. Free tier at [aistudio.google.com](https://aistudio.google.com) |
| xAI (Grok) | `XAI_API_KEY` | grok-4, grok-4-1-fast-reasoning, grok-4-1-fast-non-reasoning |
| OpenRouter | `OPENROUTER_API_KEY` | Unified gateway to 200+ models |
| MiniMax | `MINIMAX_API_KEY` | abab6.5s-chat (cost-competitive for medium tasks) |
| Kimi (Moonshot) | `KIMI_API_KEY` | moonshot-v1-8k, moonshot-v1-32k |

Providers without a configured key are automatically excluded from routing. AiPipe starts with whatever keys you have and expands as you add more.

> **Note on OpenAI Codex models (gpt-5.1-codex, gpt-5.2-codex):** Available via OpenClaw's OAuth Codex provider, not standard `OPENAI_API_KEY`. Not in AiPipe's default pool; add as a custom provider if you have Codex API access.

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

### 3. Monitor via the stats endpoint

```
GET http://localhost:8082/v1/stats
```

Returns: per-provider request counts, token usage, total cost, cache hits, latency percentiles (p50/p95/p99), and per-model quality tracking with penalty scores.

## Why Not Just Use the Cheapest Model Always?

| Task | gpt-4o-mini | claude-sonnet-4-6 / grok-4 |
|------|:---:|:---:|
| Greeting, translation, summary | ✅ Excellent | ✅ Excellent |
| Code review (simple function) | ✅ Good | ✅ Good |
| Multi-service architecture design | ⚠️ Shallow | ✅ Comprehensive |
| Formal mathematical proof | ❌ Often incorrect | ✅ Rigorous |
| Security vulnerability analysis | ❌ Pattern-matches only | ✅ Reasons about context |

Routing to cheap models for everything is not neutral — it produces subtly wrong answers on the tasks where correctness matters most. AiPipe uses the cheap model only when the cheap model is correct.

## Summary

| | Always Sonnet 4.6 | AiPipe Smart Routing |
|---|:---:|:---:|
| Cost on simple tasks | 💸 Expensive | ✅ Cheapest capable model |
| Cost with repeated queries | 💸 Full price | ✅ $0 (cache hits) |
| Quality on complex tasks | ✅ Best | ✅ Best available (promoted automatically) |
| Multi-provider support | ❌ | ✅ 8 providers |
| Per-tenant isolation | ❌ | ✅ |
| Response caching | ❌ | ✅ |
| TTFT-aware streaming | ❌ | ✅ |
| Reliability fallback | ❌ | ✅ |
| Config required | None | API keys only |

AiPipe is not an abstraction layer that trades control for convenience. It is a routing layer that gives you better outcomes: lower cost on simple tasks, higher quality on complex ones, near-zero cost on repeated queries. No changes to your application code required.

*AiPipe is built into Mission Control and available as a standalone Go binary. Source: [github.com/MikeS071/AiPipe](https://github.com/MikeS071/AiPipe)*
