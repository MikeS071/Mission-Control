---
title: "AI Smart Routing"
description: "Automatic LLM routing that selects the cheapest capable model per request using complexity scoring."
---

# AI Smart Routing

Mission Control routes every AI request to the right model automatically. You don't pick a model per call. AiPipe scores each request on complexity and picks the cheapest model that can handle it well.

## Why routing matters

Most teams pick one LLM and use it for everything. The problem:

- A **cheap model** (gpt-4o-mini) handles greetings and lookups well but makes mistakes on architecture decisions and formal reasoning
- A **frontier model** (Claude Sonnet, GPT-4o) handles everything correctly but costs 15–30× more per call than necessary for simple work

AiPipe solves this by scoring each request and routing it to the cheapest model that can handle it at sufficient quality.

**Result:** typical users save ~50% on LLM costs with no change to their workflow and no quality reduction on tasks that matter.

## How routing decisions are made

AiPipe scores each request on five signals:

1. **Length**: longer prompts generally require more capable models
2. **Code**: code blocks increase complexity; complex languages (Rust, Go, TypeScript) increase it further
3. **Keywords**: "prove by induction", "architecture tradeoffs", "security vulnerability" map to high complexity; "translate", "summarise", "hello" map to low
4. **Structure**: multi-part questions, numbered lists, and headers indicate higher complexity
5. **Depth**: multi-turn conversations carry accumulated context and route higher

The five signals combine into a single score in `[0.05, 1.0]`. This score drives model selection.

## Which model gets picked

At low complexity, the cheapest capable model wins. As complexity rises, a quality-weighted formula kicks in: models with higher benchmark scores earn a cost discount, making them more competitive despite higher nominal prices.

**Routing in practice:**

| Complexity | Typical request | Model selected |
|:---:|---|---|
| 0.05–0.20 | Greeting, simple question, status check | gpt-4o-mini |
| 0.20–0.55 | Translation, summarisation, basic code review | gpt-4o-mini |
| 0.55–0.70 | Multi-step explanation, medium code task | gpt-4o-mini or gpt-4o |
| 0.68–0.90 | Architecture analysis, complex reasoning | claude-sonnet-4-5 |
| 0.80–1.00 | Formal proofs, security audits, research | claude-sonnet-4-5 or claude-opus |

## Supported providers

AiPipe routes across all providers you've configured. Enable any provider by adding its API key in the [Connection Wizard →](/docs/features/connection-wizard).

| Provider | Models | Best for |
|----------|--------|---------|
| OpenAI | gpt-4o-mini, gpt-4o | Cost-efficient default; strong general performance |
| Anthropic | Haiku, Sonnet, Opus | Top quality on complex reasoning and coding |
| Google Gemini | Flash, Pro | Ultra-cheap for simple tasks; enormous context window |
| xAI (Grok) | Grok-4, Grok-4-fast | Fast reasoning at competitive cost |
| OpenRouter | auto | Routes across 200+ models via unified API |
| MiniMax | abab6.5s | Cost-competitive for medium tasks |
| Kimi (Moonshot) | v1-8k, v1-32k | Long-context tasks at low cost |

## Per-tenant isolation

Each tenant's API keys are stored separately. Your OpenAI key is never used for another tenant's requests. Cost is tracked per tenant so you can see exactly what you're spending.

## Caching

Non-streaming responses are cached by provider + model + normalised prompt. Identical requests return in under 5ms at zero API cost. The cache uses LRU eviction with a configurable TTL (default: 5 minutes).

## Reliability and fallback

Each model carries a success rate and penalty score. If a provider starts returning errors (rate limits, server errors), its effective score drops and traffic is shifted away automatically. Penalties decay every 30 seconds once the provider recovers.

## Monitoring routing in the dashboard

The **Router** tab shows:
- Request counts by provider and model
- Success rate per provider
- Total cost and cost breakdown by model
- Queue depth and queue capacity

Use this weekly to verify routing is working as expected and identify any providers with elevated error rates.

## For more detail

[AiPipe Benchmark: full routing analysis with cost tables →](/docs/features/aipipe-routing-benchmark)
