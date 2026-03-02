import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkBudget } from '@/lib/usage/budget';

export type UsageAlertType = 'budget_warning' | 'budget_critical' | 'budget_exceeded';

export interface UsageAlert {
  id: number;
  tenantId: number;
  alertType: UsageAlertType;
  threshold: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

const THRESHOLDS = [100, 90, 75] as const;

function mapAlertType(threshold: number): UsageAlertType {
  if (threshold >= 100) return 'budget_exceeded';
  if (threshold >= 90) return 'budget_critical';
  return 'budget_warning';
}

function buildAlertMessage(threshold: number, limit: number, used: number): string {
  if (threshold >= 100) {
    return `Budget exceeded: ${used}/${limit} requests used for current daily period.`;
  }
  return `Budget ${threshold}% threshold reached: ${used}/${limit} requests used for current daily period.`;
}

export async function checkAlerts(tenantId: number): Promise<UsageAlert[]> {
  const budget = await checkBudget(tenantId);
  if (!Number.isFinite(budget.limit) || budget.limit >= Number.MAX_SAFE_INTEGER || budget.limit <= 0) {
    return [];
  }

  const used = Math.max(0, budget.limit - budget.remaining);
  const usagePct = (used / budget.limit) * 100;
  const reachedThreshold = THRESHOLDS.find((threshold) => usagePct >= threshold);

  if (!reachedThreshold) return [];

  const periodEnd = new Date(budget.resetsAt);
  if (Number.isNaN(periodEnd.getTime())) return [];

  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 1);

  const existingResult = await db.execute(sql`
    SELECT threshold
    FROM usage_alerts
    WHERE tenant_id = ${tenantId}
      AND threshold = ${reachedThreshold}
      AND created_at >= ${periodStart}
      AND created_at < ${periodEnd}
    LIMIT 1
  `);

  if (existingResult.rows.length > 0) return [];

  const alertType = mapAlertType(reachedThreshold);
  const message = buildAlertMessage(reachedThreshold, budget.limit, used);

  const inserted = await db.execute(sql`
    INSERT INTO usage_alerts (tenant_id, alert_type, threshold, message, acknowledged)
    VALUES (${tenantId}, ${alertType}, ${reachedThreshold}, ${message}, false)
    RETURNING id, tenant_id, alert_type, threshold, message, acknowledged, created_at
  `);

  const rows = inserted.rows as Array<{
    id: number;
    tenant_id: number;
    alert_type: UsageAlertType;
    threshold: number;
    message: string;
    acknowledged: boolean;
    created_at: string | Date;
  }>;

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    alertType: row.alert_type,
    threshold: row.threshold,
    message: row.message,
    acknowledged: row.acknowledged,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
