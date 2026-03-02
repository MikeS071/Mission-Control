import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

type ParsedUsage = {
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  hypotheticalCostUsd: number;
  savedUsd: number;
  cacheHit: boolean;
  requestId: string;
};

const REQUIRED_HEADERS = [
  'X-AiPipe-Model',
  'X-AiPipe-Provider',
  'X-AiPipe-Tokens-In',
  'X-AiPipe-Tokens-Out',
  'X-AiPipe-Cost-USD',
  'X-AiPipe-Hypothetical-Cost-USD',
  'X-AiPipe-Saved-USD',
  'X-AiPipe-Cache',
  'X-AiPipe-Request-Id',
] as const;

function parseUsageHeaders(aipipeHeaders: Headers): ParsedUsage | null {
  const values = REQUIRED_HEADERS.map((name) => ({
    name,
    value: aipipeHeaders.get(name)?.trim() ?? '',
  }));

  const missing = values.filter((entry) => entry.value.length === 0).map((entry) => entry.name);
  if (missing.length > 0) {
    console.warn(`[usage] missing AiPipe headers: ${missing.join(', ')}`);
    return null;
  }

  const valueMap = new Map(values.map((entry) => [entry.name, entry.value]));
  const tokensIn = Number(valueMap.get('X-AiPipe-Tokens-In'));
  const tokensOut = Number(valueMap.get('X-AiPipe-Tokens-Out'));
  const costUsd = Number(valueMap.get('X-AiPipe-Cost-USD'));
  const hypotheticalCostUsd = Number(valueMap.get('X-AiPipe-Hypothetical-Cost-USD'));
  const savedUsd = Number(valueMap.get('X-AiPipe-Saved-USD'));

  if (![tokensIn, tokensOut, costUsd, hypotheticalCostUsd, savedUsd].every(Number.isFinite)) {
    console.warn('[usage] invalid AiPipe header values');
    return null;
  }

  return {
    model: valueMap.get('X-AiPipe-Model')!,
    provider: valueMap.get('X-AiPipe-Provider')!,
    tokensIn,
    tokensOut,
    costUsd,
    hypotheticalCostUsd,
    savedUsd,
    cacheHit: valueMap.get('X-AiPipe-Cache')!.toLowerCase() === 'hit',
    requestId: valueMap.get('X-AiPipe-Request-Id')!,
  };
}

async function upsertUsageSummary(
  tenantId: number,
  periodType: 'day' | 'month',
  periodStart: Date,
  usage: ParsedUsage,
) {
  await db.execute(sql`
    INSERT INTO usage_summary (
      tenant_id,
      period_type,
      period_start,
      requests_count,
      tokens_in,
      tokens_out,
      cost_usd,
      hypothetical_cost_usd,
      saved_usd,
      cache_hits,
      updated_at
    ) VALUES (
      ${tenantId},
      ${periodType},
      ${periodStart},
      ${1},
      ${usage.tokensIn},
      ${usage.tokensOut},
      ${usage.costUsd},
      ${usage.hypotheticalCostUsd},
      ${usage.savedUsd},
      ${usage.cacheHit ? 1 : 0},
      NOW()
    )
    ON CONFLICT (tenant_id, period_type, period_start)
    DO UPDATE SET
      requests_count = usage_summary.requests_count + EXCLUDED.requests_count,
      tokens_in = usage_summary.tokens_in + EXCLUDED.tokens_in,
      tokens_out = usage_summary.tokens_out + EXCLUDED.tokens_out,
      cost_usd = usage_summary.cost_usd + EXCLUDED.cost_usd,
      hypothetical_cost_usd = usage_summary.hypothetical_cost_usd + EXCLUDED.hypothetical_cost_usd,
      saved_usd = usage_summary.saved_usd + EXCLUDED.saved_usd,
      cache_hits = usage_summary.cache_hits + EXCLUDED.cache_hits,
      updated_at = NOW()
  `);
}

export async function recordUsage(tenantId: number, aipipeHeaders: Headers): Promise<void> {
  const usage = parseUsageHeaders(aipipeHeaders);
  if (!usage) return;

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  try {
    await db.execute(sql`
      INSERT INTO usage_ledger (
        tenant_id,
        model,
        provider,
        tokens_in,
        tokens_out,
        cost_usd,
        hypothetical_cost_usd,
        saved_usd,
        cache_hit,
        request_id
      ) VALUES (
        ${tenantId},
        ${usage.model},
        ${usage.provider},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costUsd},
        ${usage.hypotheticalCostUsd},
        ${usage.savedUsd},
        ${usage.cacheHit},
        ${usage.requestId}
      )
    `);

    await upsertUsageSummary(tenantId, 'day', dayStart, usage);
    await upsertUsageSummary(tenantId, 'month', monthStart, usage);
  } catch (error) {
    console.warn('[usage] metering write failed:', error);
  }
}
