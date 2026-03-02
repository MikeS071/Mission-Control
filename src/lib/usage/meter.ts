import { sql } from 'drizzle-orm';
import { usageLedger } from '@/db/schema';
import { db } from '@/lib/db';
import { getTenantPlan } from '@/lib/billing';
import { checkAlerts } from '@/lib/usage/alerts';
import { getTenantCost } from '@/lib/usage/pricing';

type SummaryPeriod = 'daily' | 'monthly';

function parseInteger(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function parseFloatValue(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

async function upsertUsageSummary(input: {
  tenantId: number;
  period: SummaryPeriod;
  periodStart: Date;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  savedUsd: number;
  cacheHit: boolean;
}) {
  await db.execute(sql`
    WITH updated AS (
      UPDATE usage_summary
      SET
        total_tokens_in = total_tokens_in + ${input.tokensIn},
        total_tokens_out = total_tokens_out + ${input.tokensOut},
        total_cost_usd = (total_cost_usd::numeric + ${input.costUsd})::numeric(12,6),
        total_saved_usd = (total_saved_usd::numeric + ${input.savedUsd})::numeric(12,6),
        request_count = request_count + 1,
        cache_hits = cache_hits + ${input.cacheHit ? 1 : 0},
        updated_at = NOW()
      WHERE tenant_id = ${input.tenantId}
        AND period = ${input.period}
        AND period_start = ${input.periodStart}
      RETURNING id
    )
    INSERT INTO usage_summary (
      tenant_id,
      period,
      period_start,
      total_tokens_in,
      total_tokens_out,
      total_cost_usd,
      total_saved_usd,
      request_count,
      cache_hits,
      updated_at
    )
    SELECT
      ${input.tenantId},
      ${input.period},
      ${input.periodStart},
      ${input.tokensIn},
      ${input.tokensOut},
      ${input.costUsd},
      ${input.savedUsd},
      1,
      ${input.cacheHit ? 1 : 0},
      NOW()
    WHERE NOT EXISTS (SELECT 1 FROM updated)
  `);
}

export async function recordUsage(tenantId: number, aipipeHeaders: Headers): Promise<void> {
  try {
    const model = aipipeHeaders.get('X-AiPipe-Model')?.trim() ?? '';
    const provider = aipipeHeaders.get('X-AiPipe-Provider')?.trim() ?? '';
    const tokensIn = parseInteger(aipipeHeaders.get('X-AiPipe-Tokens-In'));
    const tokensOut = parseInteger(aipipeHeaders.get('X-AiPipe-Tokens-Out'));
    const costUsd = parseFloatValue(aipipeHeaders.get('X-AiPipe-Cost-USD'));

    if (!model || !provider || tokensIn === null || tokensOut === null || costUsd === null) {
      console.warn('[usage] Missing required AiPipe metering headers; skipping usage record.');
      return;
    }

    const hypotheticalCostUsd = parseFloatValue(aipipeHeaders.get('X-AiPipe-Hypothetical-Cost-USD'));
    const savedUsd = parseFloatValue(aipipeHeaders.get('X-AiPipe-Saved-USD')) ?? 0;
    const cacheHit = aipipeHeaders.get('X-AiPipe-Cache')?.toLowerCase() === 'hit';
    const requestId = aipipeHeaders.get('X-AiPipe-Request-Id')?.trim() || null;

    let tenantPlan = 'free';
    try {
      tenantPlan = await getTenantPlan(tenantId);
    } catch (err) {
      console.warn('[usage] Failed to resolve tenant plan; defaulting to free:', err);
    }

    const tenantCostUsd = getTenantCost(costUsd, model, tenantPlan);

    await db.insert(usageLedger).values({
      tenantId,
      model,
      provider,
      tokensIn,
      tokensOut,
      costUsd: costUsd.toFixed(6),
      tenantCostUsd: tenantCostUsd.toFixed(6),
      hypotheticalCostUsd: hypotheticalCostUsd === null ? null : hypotheticalCostUsd.toFixed(6),
      savedUsd: savedUsd.toFixed(6),
      cacheHit,
      requestId,
    });

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    await Promise.all([
      upsertUsageSummary({
        tenantId,
        period: 'daily',
        periodStart: dayStart,
        tokensIn,
        tokensOut,
        costUsd,
        savedUsd,
        cacheHit,
      }),
      upsertUsageSummary({
        tenantId,
        period: 'monthly',
        periodStart: monthStart,
        tokensIn,
        tokensOut,
        costUsd,
        savedUsd,
        cacheHit,
      }),
    ]);

    void checkAlerts(tenantId).catch((err) => {
      console.warn('[usage] Failed to evaluate usage alerts:', err);
    });
  } catch (err) {
    console.warn('[usage] Failed to record usage:', err);
  }
}
