---
title: "AI Smart Routing: Technical Reference"
description: "Internals of AiPipe complexity scoring, model selection, and routing algorithm."
---

# AI Smart Routing: Technical Reference

See [AiPipe Integration: Technical Reference](./aipipe-integration) for the full routing algorithm, quality-adjusted cost formula, and API architecture.

## Routing Flow

```
Incoming request
  ↓
Complexity scorer (5 signals → [0.05, 1.0])
  ↓
Model registry filter:
  (1) Context window guard
  (2) MaxComplexity threshold
  (3) Quality gate (effectiveSuccessRate ≥ 0.95)
  ↓
Sort by quality-adjusted cost (+ TTFT penalty for streaming)
  ↓
Selected model → provider API call
  ↓
Response + token/cost tracking → stats
```

## Complexity Scorer (`util/scorer.go`)

Five-signal weighted pipeline:

| Signal | Weight | Notes |
|--------|--------|-------|
| Length | 30% | Normalised to 8K tokens |
| Code | 25% | Language-aware: Rust/Go/C++ > bash/JSON |
| Keywords | 25% | Signed weights; floor enforced for high-confidence categories |
| Structure | 10% | Numbered lists, headers, multi-part questions |
| Depth | 10% | Conversation turn count |

**Keyword floors** guarantee minimum routing tier regardless of message length:
- `proof/theorem/formal` → floor 0.78 (Sonnet+)
- `architecture/security` → floor 0.68 (Sonnet)
- `analysis/debug` → floor 0.52 (mid-tier)

## Model Registry

Models are configured in `Server/internal/model/models.go`. Each has:

| Field | Type | Description |
|-------|------|-------------|
| `ID` | string | Provider model ID |
| `Provider` | enum | anthropic, openai, gemini, grok, openrouter, minimax, kimi |
| `MaxComplexity` | float64 | Hard ceiling: requests above this score exclude the model |
| `QualityScore` | float64 | [0,1] calibrated from LMSYS Arena, SWE-bench, MATH-500 |
| `CostInput1M` | float64 | USD per 1M input tokens |
| `CostOutput1M` | float64 | USD per 1M output tokens |
| `MaxContextWindow` | int | 0 = unconstrained |

## Quality-Adjusted Cost Formula

```
adjustedCost = rawCost / qualityScore ^ qualityExponent
qualityExponent = max(0, complexity - 0.25) × 6
```

At `complexity < 0.25`: `qualityExponent = 0` → pure cost optimisation.  
At `complexity = 0.68`: `qualityExponent ≈ 2.58` → strong quality preference.  
At `complexity = 0.90`: `qualityExponent ≈ 3.90` → dominant quality preference.

## Penalty and Reliability

- `429` / `5xx` responses: `penalty += 2`
- `4xx` responses: `penalty += 1`
- `effectiveSuccessRate = successRate - penalty × 0.02`
- Penalty decays: `−1` every 30 seconds via background goroutine
- Models with `effectiveSuccessRate < 0.95` are excluded until they recover

## TTFT Tracking

Per-model time-to-first-token is tracked via exponential moving average:
- α = 0.15 (15% weight on new samples)
- Stored as `atomic.Int64` (µs × 1000), updated via lock-free CAS loop
- For streaming requests: `adjustedCost += rawCost × min(TTFT_ms/6666, 0.30)`

## Dashboard Integration

The AiPipe stats widget (`src/components/AiPipeWidget.tsx`) polls `/api/aipipe/stats` every 30 seconds and renders:
- Total requests, savings %, cache hit rate
- Per-model breakdown (requests, cost, latency)
- Provider health with penalty indicators

MC API routes: `src/app/api/aipipe/stats/route.ts`, `src/app/api/aipipe/health/route.ts`
