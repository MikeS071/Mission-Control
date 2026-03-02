import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getOrCreatePolicy } from '@/lib/policy';

const UNLIMITED_BUDGET = Number.MAX_SAFE_INTEGER;

export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  period: 'daily';
  resetsAt: string;
}

export async function checkBudget(tenantId: number): Promise<BudgetCheckResult> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const nextDay = new Date(startOfDay);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const unlimitedResult: BudgetCheckResult = {
    allowed: true,
    remaining: UNLIMITED_BUDGET,
    limit: UNLIMITED_BUDGET,
    period: 'daily',
    resetsAt: nextDay.toISOString(),
  };

  try {
    const policy = await getOrCreatePolicy(tenantId);
    const configuredLimit = policy.limits.api_calls_per_day;

    if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
      return unlimitedResult;
    }

    const limit = Math.floor(configuredLimit);
    const usageResult = await db.execute(sql`
      SELECT COALESCE(request_count, 0)::int AS request_count
      FROM usage_summary
      WHERE tenant_id = ${tenantId}
        AND period = 'daily'
        AND period_start = ${startOfDay}
      LIMIT 1
    `);

    const usageRow = usageResult.rows[0] as { request_count?: unknown } | undefined;
    const used = Math.max(0, Number(usageRow?.request_count ?? 0));
    const remaining = Math.max(0, limit - used);

    return {
      allowed: used < limit,
      remaining,
      limit,
      period: 'daily',
      resetsAt: nextDay.toISOString(),
    };
  } catch (err) {
    console.warn('[usage] Budget check failed; defaulting to allow:', err);
    return unlimitedResult;
  }
}
