/**
 * AiPipe client — thin wrapper around the local AiPipe router service.
 * AiPipe URL is read from AIPIPE_URL env var (set in .env.local).
 * All functions throw on network error; callers handle 503/unavailable.
 */

const AIPIPE_URL = (process.env.AIPIPE_URL ?? 'http://127.0.0.1:8082').replace(/\/$/, '');
const AIPIPE_ADMIN_SECRET = process.env.AIPIPE_ADMIN_SECRET ?? '';
const AIPIPE_TIMEOUT_MS = 5_000; // for health/stats — not for proxy calls

// Provider name map: MC settings field → AiPipe provider name
const PROVIDER_KEY_MAP: Record<string, string> = {
  openaiKey:     'openai',
  anthropicKey:  'anthropic',
  xaiKey:        'grok',
  openrouterKey: 'openrouter',
  minimaxKey:    'minimax',
  kimiKey:       'kimi',
  geminiKey:     'gemini',
};

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

/** Per-tenant stats snapshot returned by AiPipe's /v1/tenants/{id}/stats endpoint. */
export interface TenantStatsSnapshot {
  tenant_id: string;
  requests:  number;
  in_tokens:  number;
  out_tokens: number;
  cost_usd:   number;
  updated_at: string;
}

/**
 * Sync provider API keys for a tenant into AiPipe's per-tenant store.
 * Silently no-ops if AIPIPE_ADMIN_SECRET is not configured.
 * Failure is non-fatal — keys are also persisted in MC DB.
 */
export async function aipipeSyncTenantKeys(
  tenantId: string,
  settings: Record<string, string | undefined>,
): Promise<void> {
  if (!AIPIPE_ADMIN_SECRET) return;

  const syncs = Object.entries(PROVIDER_KEY_MAP)
    .map(([field, provider]) => ({ provider, apiKey: settings[field] }))
    .filter((e): e is { provider: string; apiKey: string } => Boolean(e.apiKey));

  await Promise.allSettled(
    syncs.map(({ provider, apiKey }) =>
      fetch(`${AIPIPE_URL}/v1/tenants/${encodeURIComponent(tenantId)}/providers`, {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-Admin-Secret':  AIPIPE_ADMIN_SECRET,
        },
        body: JSON.stringify({ provider, api_key: apiKey }),
        signal: AbortSignal.timeout(AIPIPE_TIMEOUT_MS),
      }),
    ),
  );
}

/**
 * Fetch per-tenant stats from AiPipe.
 * Returns null if unavailable or admin secret not configured.
 */
export async function aipipeTenantStats(tenantId: string): Promise<TenantStatsSnapshot | null> {
  if (!AIPIPE_ADMIN_SECRET) return null;
  try {
    const res = await fetch(
      `${AIPIPE_URL}/v1/tenants/${encodeURIComponent(tenantId)}/stats`,
      {
        headers: { 'X-Admin-Secret': AIPIPE_ADMIN_SECRET },
        signal: AbortSignal.timeout(AIPIPE_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<TenantStatsSnapshot>;
  } catch {
    return null;
  }
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
export async function aipipeProxyChat(
  body: unknown,
  tenantId?: string,
  timeoutMs = 120_000,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return fetch(`${AIPIPE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Forward a raw request body to AiPipe's Anthropic-compatible endpoint. */
export async function aipipeProxyMessages(
  body: unknown,
  tenantId?: string,
  timeoutMs = 120_000,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return fetch(`${AIPIPE_URL}/v1/messages`, {
    method: 'POST',
    headers,
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
