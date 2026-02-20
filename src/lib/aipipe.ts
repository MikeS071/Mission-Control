/**
 * AiPipe client — thin wrapper around the local AiPipe router service.
 * AiPipe URL is read from AIPIPE_URL env var (set in .env.local).
 * All functions throw on network error; callers handle 503/unavailable.
 */

const AIPIPE_URL = (process.env.AIPIPE_URL ?? 'http://127.0.0.1:8082').replace(/\/$/, '');
const AIPIPE_TIMEOUT_MS = 5_000; // for health/stats — not for proxy calls

export interface AiPipeStats {
  runtime: {
    latency_p50_ms: number;
    latency_p95_ms: number;
    latency_p99_ms: number;
    ttft_p50_ms: number;
    ttft_p95_ms: number;
    ttft_p99_ms: number;
    providers: Array<{
      provider: string;
      requests: number;
      success: number;
      errors: number;
      cache_hits: number;
      input_tokens: number;
      output_tokens: number;
      streaming_calls: number;
      total_cost_usd: number;
    }>;
    models: Array<{
      provider: string;
      model: string;
      requests: number;
      success: number;
      errors: number;
      input_tokens: number;
      output_tokens: number;
      total_cost_usd: number;
    }>;
  };
  model_tracking: Array<{
    provider: string;
    model: string;
    requests: number;
    success_rate: number;
    penalty: number;
    total_cost_usd: number;
    effective_success_rate: number;
  }>;
  queue_depth: number;
  queue_capacity: number;
}

/** Fetch AiPipe health status. Returns true if healthy, false if unreachable. */
export async function aipipeHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${AIPIPE_URL}/healthz`, {
      signal: AbortSignal.timeout(AIPIPE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch AiPipe runtime stats. Throws if AiPipe is unreachable. */
export async function aipipeStats(): Promise<AiPipeStats> {
  const res = await fetch(`${AIPIPE_URL}/v1/stats`, {
    signal: AbortSignal.timeout(AIPIPE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`AiPipe stats returned ${res.status}`);
  }
  return res.json() as Promise<AiPipeStats>;
}

/** Forward a raw request body to AiPipe's OpenAI-compatible endpoint. */
export async function aipipeProxyChat(body: unknown, timeoutMs = 120_000): Promise<Response> {
  return fetch(`${AIPIPE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Forward a raw request body to AiPipe's Anthropic-compatible endpoint. */
export async function aipipeProxyMessages(body: unknown, timeoutMs = 120_000): Promise<Response> {
  return fetch(`${AIPIPE_URL}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Compute a simple "savings estimate" from AiPipe stats.
 * Returns estimated % cost reduction vs. routing everything to gpt-4o.
 */
export function estimateSavingsPercent(stats: AiPipeStats): number {
  const models = stats.runtime.models;
  if (!models || models.length === 0) return 0;

  let totalCost = 0;
  let totalRequests = 0;
  for (const m of models) {
    totalCost += m.total_cost_usd;
    totalRequests += m.requests;
  }
  if (totalRequests === 0) return 0;

  // Baseline: all requests at gpt-4o pricing ($2.50/M in, $10/M out, ~500 tokens avg)
  const avgTokensPerRequest = 500;
  const gpt4oCostPer1M = 6.25; // blended in/out
  const baselineCost = (totalRequests * avgTokensPerRequest * gpt4oCostPer1M) / 1_000_000;

  if (baselineCost === 0) return 0;
  const savings = (baselineCost - totalCost) / baselineCost;
  return Math.max(0, Math.min(savings * 100, 99));
}
