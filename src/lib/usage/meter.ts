import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usageLedger, usageSummary } from '@/db/schema';
import { getTenantPlan } from '@/lib/billing';
import { getTenantCost } from '@/lib/usage/pricing';

type SummaryPeriod = 'daily' | 'monthly';

function parseInteger(rawValue: string | null): number {
  if (!rawValue) return 0;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFloatValue(rawValue: string | null): number {
  if (!rawValue) return 0;
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPeriodStart(date: Date, period: SummaryPeriod): string {
  if (period === 'daily') return toDateKey(date);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function toUsdString(value: number): string {
  return value.toFixed(6);
}

export async function recordUsage(tenantId: number, aipipeHeaders: Headers): Promise<void> {
  const model = aipipeHeaders.get('X-AiPipe-Model');
  const provider = aipipeHeaders.get('X-AiPipe-Provider');
  const tokensInRaw = aipipeHeaders.get('X-AiPipe-Tokens-In');
  const tokensOutRaw = aipipeHeaders.get('X-AiPipe-Tokens-Out');
  const costUsdRaw = aipipeHeaders.get('X-AiPipe-Cost-USD');
  const hypotheticalCostUsdRaw = aipipeHeaders.get('X-AiPipe-Hypothetical-Cost-USD');
  const savedUsdRaw = aipipeHeaders.get('X-AiPipe-Saved-USD');
  const cacheRaw = aipipeHeaders.get('X-AiPipe-Cache');
  const requestIdRaw = aipipeHeaders.get('X-AiPipe-Request-Id');

  const missingHeaders = [
    ['X-AiPipe-Model', model],
    ['X-AiPipe-Provider', provider],
    ['X-AiPipe-Tokens-In', tokensInRaw],
    ['X-AiPipe-Tokens-Out', tokensOutRaw],
    ['X-AiPipe-Cost-USD', costUsdRaw],
    ['X-AiPipe-Hypothetical-Cost-USD', hypotheticalCostUsdRaw],
    ['X-AiPipe-Saved-USD', savedUsdRaw],
    ['X-AiPipe-Cache', cacheRaw],
    ['X-AiPipe-Request-Id', requestIdRaw],
  ]
    .filter(([, value]) => value == null)
    .map(([name]) => name);

  if (missingHeaders.length > 0) {
    console.warn('[usage] Missing AiPipe headers:', missingHeaders.join(', '));
  }

  const tokensIn = parseInteger(tokensInRaw);
  const tokensOut = parseInteger(tokensOutRaw);
  const costUsd = parseFloatValue(costUsdRaw);
  const hypotheticalCostUsd = parseFloatValue(hypotheticalCostUsdRaw);
  const savedUsd = parseFloatValue(savedUsdRaw);
  const cacheHit = (cacheRaw ?? '').trim().toLowerCase() === 'hit';
  const requestId = requestIdRaw?.trim() || null;
  const normalizedModel = model?.trim() || 'unknown';
  const normalizedProvider = provider?.trim() || 'unknown';

  const tenantPlan = await getTenantPlan(tenantId).catch(() => 'free');
  const tenantCostUsd = getTenantCost(costUsd, normalizedModel, tenantPlan);
  const now = new Date();

  await db.insert(usageLedger).values({
    tenantId,
    requestId,
    model: normalizedModel,
    provider: normalizedProvider,
    tokensIn,
    tokensOut,
    costUsd: toUsdString(costUsd),
    tenantCostUsd: toUsdString(tenantCostUsd),
    hypotheticalCostUsd: toUsdString(hypotheticalCostUsd),
    savedUsd: toUsdString(savedUsd),
    cacheHit,
    recordedAt: now,
  });

  const upsertSummary = async (period: SummaryPeriod) => {
    const periodStart = getPeriodStart(now, period);
    await db
      .insert(usageSummary)
      .values({
        tenantId,
        period,
        periodStart,
        requests: 1,
        tokensIn,
        tokensOut,
        costUsd: toUsdString(costUsd),
        tenantCostUsd: toUsdString(tenantCostUsd),
        savedUsd: toUsdString(savedUsd),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [usageSummary.tenantId, usageSummary.period, usageSummary.periodStart],
        set: {
          requests: sql`${usageSummary.requests} + 1`,
          tokensIn: sql`${usageSummary.tokensIn} + ${tokensIn}`,
          tokensOut: sql`${usageSummary.tokensOut} + ${tokensOut}`,
          costUsd: sql`${usageSummary.costUsd} + ${costUsd}`,
          tenantCostUsd: sql`${usageSummary.tenantCostUsd} + ${tenantCostUsd}`,
          savedUsd: sql`${usageSummary.savedUsd} + ${savedUsd}`,
          updatedAt: now,
        },
      });
  };

  await Promise.all([upsertSummary('daily'), upsertSummary('monthly')]);
}
