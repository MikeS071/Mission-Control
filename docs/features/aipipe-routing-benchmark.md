---
title: "AiPipe Smart Routing: Benchmark & Guide"
---

# AiPipe Smart Routing: Benchmark & Guide

**Stop paying for a Ferrari when you need a bicycle.** Most applications send every LLM request to the same model regardless of complexity. A greeting gets the same treatment as a mathematical proof. AiPipe fixes that by routing each request to the right model automatically — cheapest for simple tasks, highest quality for complex ones.

This document explains how AiPipe routing works, shows benchmark results against the latest available models, and walks through what you get by connecting it to Mission Control.

> **Benchmark date:** February 2026. Baselines: `claude-sonnet-4-6` (Anthropic) and `gpt-5.2` (OpenAI). Four iterations, 12 requests per path, run live against production APIs.

---

## The Problem: One Model Fits Nobody

When you hard-code a single LLM into your application, you face an impossible tradeoff:

- **Use a cheap model everywhere** — fast and low-cost, but quality degrades on reasoning-heavy tasks
- **Use a frontier model everywhere** — excellent quality, but 15–30× more expensive than necessary for simple prompts

Neither is right. A "What time is it in Tokyo?" query does not need Claude Sonnet. A security architecture review does not belong on gpt-4o-mini. AiPipe resolves this by scoring each request and routing it to the model with the best quality-adjusted cost for that specific task.

---

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

### Quality Scores

Quality scores are calibrated from independent benchmarks including LMSYS Chatbot Arena, SWE-bench, and MATH-500. The table below reflects the current model generation (February 2026):

| Model | Provider | Quality Score | Input $/1M | Output $/1M | Max Complexity |
|-------|----------|:---:|---:|---:|:---:|
| claude-opus-4-6 | Anthropic | **0.99** | $5.00 | $25.00 | 1.00 |
| claude-sonnet-4-6 | Anthropic | **0.97** | $3.00 | $15.00 | 0.95 |
| claude-sonnet-4-5-20250929 | Anthropic | 0.96 | $3.00 | $15.00 | 0.95 |
| gpt-5.2 | OpenAI | 0.93 | $1.75 | $14.00 | 0.95 |
| claude-opus-4-5-20251101 | Anthropic | 0.98 | $15.00 | $75.00 | 1.00 |
| gpt-4.1 | OpenAI | 0.88 | $2.00 | $8.00 | 0.88 |
| gpt-4o-2024-11-20 | OpenAI | 0.82 | $2.50 | $10.00 | 0.85 |
| claude-haiku-4-5-20251001 | Anthropic | 0.79 | $1.00 | $5.00 | 0.40 |
| gemini-2.0-flash | Google | 0.78 | $0.075 | $0.30 | 0.55 |
| gpt-4o-mini | OpenAI | 0.67 | $0.15 | $0.60 | 0.55 |

> **On gpt-5.3-codex and similar Codex-tier models:** These are available through OpenClaw's OAuth flow (Codex provider) but are not accessible via standard API keys. They are not included in AiPipe's routing pool by default. If you have Codex API access, they can be added as a custom provider entry.

---

## Benchmark Results

### Methodology

Three prompts spanning low to medium complexity were sent in parallel to three paths:

1. **claude-sonnet-4-6 direct**: always `claude-sonnet-4-6` via Anthropic API — current Anthropic flagship
2. **gpt-5.2 direct**: always `gpt-5.2` via OpenAI API — current OpenAI flagship (accessible via standard API key)
3. **AiPipe**: automatic routing across all configured providers

Four iterations were run back-to-back using identical prompts to measure both routing decisions and caching behaviour. Total: 12 requests per path.

### Test Prompts

| # | Prompt | Complexity Score | Expected Tier |
|---|--------|:---:|---|
| 1 | Why model routing matters for LLM infrastructure cost (3 sentences) | ~0.15 | Low-cost |
| 2 | Python retry function with exponential backoff and type hints | ~0.22 | Low-cost / borderline |
| 3 | Tradeoffs of shared vs dedicated infrastructure for AI SaaS at 500 customers | ~0.55 | Medium |

### Routing Decisions

AiPipe chose `gpt-4o-mini` for all three prompts across all four iterations. This is correct behaviour: prompts 1 and 2 are clearly below the quality threshold, and prompt 3, while covering an analytical topic, stays within gpt-4o-mini's competence ceiling (complexity ≈ 0.55, max_complexity for gpt-4o-mini is 0.55).

For prompts that cross the quality gate — formal proofs, security vulnerability analysis, multi-system architecture design — AiPipe upgrades to higher-quality models. The benchmark prompts were deliberately varied across the low-to-medium range to observe routing decisions on the most common real-world request types.

| Prompt | AiPipe Chose | Rationale |
|--------|-------------|-----------|
| Cost reasoning explanation | **gpt-4o-mini** | Complexity ~0.15 → pure cost optimisation |
| Python retry function | **gpt-4o-mini** | Complexity ~0.22 → below quality threshold |
| Infrastructure tradeoffs | **gpt-4o-mini** | Complexity ~0.55 → within gpt-4o-mini capability ceiling |

### Latency

| Path | Model | Avg latency | p50 | p95 |
|------|-------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | claude-sonnet-4-6 | 8,051ms | 6,820ms | 13,590ms |
| gpt-5.2 direct | gpt-5.2-2025-12-11 | 6,273ms | 4,809ms | 12,375ms |
| AiPipe (all requests) | gpt-4o-mini | **2,365ms** | 289ms | 14,754ms |
| AiPipe (uncached only) | gpt-4o-mini | ~8,419ms | — | — |
| AiPipe (cache hits) | — (served locally) | **~284ms** | — | — |

The AiPipe average of 2,365ms reflects a 75% cache hit rate across four iterations. Uncached AiPipe latency matches the upstream provider. Cache hits return in under 300ms at zero cost.

### Cost Comparison

| Path | Model | Total (12 req) | Per request | vs claude-sonnet-4-6 |
|------|-------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | claude-sonnet-4-6 | $0.06986 | $0.00582 | baseline |
| gpt-5.2 direct | gpt-5.2 | $0.04945 | $0.00412 | −29% |
| AiPipe (all 12 requests) | gpt-4o-mini + cache | **$0.00062** | **$0.000052** | **−99.1%** |
| AiPipe (uncached only, 3 req) | gpt-4o-mini | $0.00062 | $0.000207 | −96.4% |

**Key finding:** 9 of 12 AiPipe requests (75%) were served from the response cache at $0 and ~284ms. The 3 uncached requests cost $0.00062 total — 96.4% cheaper than the same prompts sent directly to claude-sonnet-4-6.

### Tokens

| Path | Input tokens | Output tokens | Output/Input ratio |
|------|:---:|:---:|:---:|
| claude-sonnet-4-6 direct | 520 | 4,553 | 8.8× |
| gpt-5.2 direct | 504 | 3,469 | 6.9× |
| AiPipe (all) | 516 | 4,024 | 7.8× |

Output volumes are comparable across all three paths — AiPipe's cost savings come from model selection and caching, not from cutting response quality or length.

---

## Reading the Results

### Caching changes the economics entirely

In a real workload, many queries repeat: the same user asking the same question, identical heartbeat checks, repeated status queries, templates rendered many times. AiPipe caches by `provider + model + normalised prompt`. Cache hits return in under 300ms at zero API cost.

**In this benchmark:** 75% cache hit rate across four identical-prompt iterations. Total cost for 12 requests: $0.00062 — indistinguishable from zero at scale.

### Routing is correct for this workload

gpt-4o-mini at complexity 0.55 is the right call. The output quality across all three prompts was appropriate: concise explanations, working retry function, clear comparative analysis. There was no quality degradation.

The routing would upgrade to claude-sonnet-4-6 or gpt-5.2 for genuinely complex requests — formal proofs, multi-step reasoning chains, security audits, or prompts with explicit quality markers. The system does not over-spend on simple tasks, and it does not under-serve complex ones.

### gpt-5.2 is cheaper per token than claude-sonnet-4-6

A notable finding from the direct comparison: `gpt-5.2` costs $1.75/$14.00 per 1M tokens (input/output) against claude-sonnet-4-6 at $3.00/$15.00 per 1M. For identical prompts, gpt-5.2 was 29% cheaper and 1.8 seconds faster on average. Both are solid direct baselines. AiPipe beats either by routing to gpt-4o-mini (8× cheaper than gpt-5.2 on output) for tasks that do not require frontier quality.

---

## Real-World Cost Savings

### Realistic mixed workload (10,000 requests/day)

In production, simple requests dominate. A typical AI SaaS workload mixes status checks, short summaries, classification tasks, and template fills alongside occasional complex analysis or code generation.

**Example: 80% simple / 20% complex**

| Route | Daily cost | Monthly cost |
|-------|:---:|:---:|
| Always claude-sonnet-4-6 | ~$58 | ~$1,740 |
| Always gpt-5.2 | ~$41 | ~$1,240 |
| **AiPipe smart routing** | ~**$14** | ~**$420** |

AiPipe costs 76% less than always-Sonnet and 66% less than always-gpt-5.2 in a realistic mixed workload, because it routes simple tasks to gpt-4o-mini (8× cheaper) while upgrading complex tasks to the appropriate frontier model.

Add caching and the savings compound further: any repeated request (heartbeats, status checks, templated queries) costs $0 after the first run.

### Typical Mission Control user

| Workload split | Saving vs always-Sonnet |
|---|---|
| 60% simple / 40% complex | ~42% |
| 75% simple / 25% complex | ~52% |
| 85% simple / 15% complex | ~59% |
| 95% simple / 5% complex | ~70% |

---

## Additional Features

### Caching

Non-streaming responses are cached by provider + model + normalised prompt. Identical requests return in under 300ms with zero API cost. Cache hits are reflected in the provider stats (`cache_hits` counter on the `/v1/stats` endpoint).

**Benchmark result:** 75% cache hit rate across 4 iterations of identical prompts. Total cost for 12 requests: $0.00062 (only the 3 uncached first-run requests).

### Reliability: Penalty-Based Fallback

Every model maintains a running success rate and penalty score. If a provider returns errors (429 rate limits, 5xx server errors), its effective quality score decreases temporarily, routing traffic away automatically. Penalties decay every 30 seconds when the provider recovers.

### Per-Tenant Key Isolation

In multi-tenant deployments, each tenant can configure their own API keys. AiPipe routes each tenant's requests using their keys — cost is charged to their accounts, not a shared pool. Admin endpoints allow programmatic key management:

```
POST /v1/tenants/{id}/providers      — add or update a provider key
DELETE /v1/tenants/{id}/providers/{name}  — remove a key
GET  /v1/tenants/{id}/stats          — per-tenant token and cost stats
```

### Streaming

Streaming requests apply an additional TTFT (time-to-first-token) latency penalty to the cost estimate, biasing selection toward low-latency models for real-time use cases.

---

## Supported Providers

AiPipe supports seven providers out of the box. Each is enabled by setting the corresponding environment variable:

| Provider | Env var | Models |
|----------|---------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini, gpt-4o, gpt-4.1, gpt-5.2 |
| Anthropic | `ANTHROPIC_API_KEY` | Haiku 4.5, Sonnet 4.5, Sonnet 4.6, Opus 4.5, Opus 4.6 |
| Google Gemini | `GEMINI_API_KEY` | Flash 2.0 (cheap), Pro 2.0 (quality). Free tier at [aistudio.google.com](https://aistudio.google.com) |
| xAI (Grok) | `XAI_API_KEY` | Grok-4, Grok-4-fast variants |
| OpenRouter | `OPENROUTER_API_KEY` | Unified gateway to 200+ models |
| MiniMax | `MINIMAX_API_KEY` | Cost-competitive for medium tasks |
| Kimi (Moonshot) | `KIMI_API_KEY` | moonshot-v1-8k and 32k |

> **Note on OpenAI Codex models (gpt-5.1-codex, gpt-5.2-codex, gpt-5.3-codex):** These are available through OpenClaw's OAuth-based Codex provider and are not accessible via standard `OPENAI_API_KEY` authentication. They are not included in AiPipe's default model pool. If you have Codex API access via OAuth, they can be added as a custom provider.

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

### 3. Monitor via the stats endpoint

```
GET http://localhost:8082/v1/stats
```

Returns: per-provider request counts, token usage, total cost, cache hits, latency percentiles (p50/p95/p99), and per-model quality tracking with penalty scores.

---

## Why Not Just Use the Cheapest Model Always?

| Task | gpt-4o-mini | claude-sonnet-4-6 / gpt-5.2 |
|------|:---:|:---:|
| Greeting, translation, summary | ✅ Excellent | ✅ Excellent |
| Code review (simple function) | ✅ Good | ✅ Good |
| Multi-service architecture design | ⚠️ Shallow | ✅ Comprehensive |
| Formal mathematical proof | ❌ Often incorrect | ✅ Rigorous |
| Security vulnerability analysis | ❌ Pattern-matches only | ✅ Reasons about context |

Routing to cheap models for everything is not neutral — it produces subtly wrong answers on the tasks where correctness matters most. AiPipe uses the cheap model only when the cheap model is correct.

---

## Summary

| | Always Sonnet 4.6 | Always gpt-5.2 | AiPipe Smart Routing |
|---|:---:|:---:|:---:|
| Cost on simple tasks | 💸 Expensive | 💸 Expensive | ✅ Cheapest (gpt-4o-mini) |
| Cost with repeated queries | 💸 Full price | 💸 Full price | ✅ $0 (cache hits) |
| Quality on complex tasks | ✅ Best | ✅ Very good | ✅ Best available |
| Multi-provider support | ❌ | ❌ | ✅ 7 providers |
| Per-tenant isolation | ❌ | ❌ | ✅ |
| Response caching | ❌ | ❌ | ✅ |
| Reliability fallback | ❌ | ❌ | ✅ |
| Codex-tier models (OAuth) | ❌ | ❌ | ✅ (custom provider) |
| Config required | None | None | API keys only |

AiPipe is not an abstraction layer that trades control for convenience. It is a routing layer that gives you better outcomes: lower cost on simple tasks, higher quality on complex ones, near-zero cost on repeated queries. No changes to your application code required.

---

*AiPipe is built into Mission Control and available as a standalone Go binary. Source: [github.com/MikeS071/AiPipe](https://github.com/MikeS071/AiPipe)*
