import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type AlertType = 'budget_warning' | 'budget_critical' | 'budget_exceeded';

export type Alert = {
  id: number;
  tenantId: number;
  alertType: AlertType;
  threshold: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
};

type AlertRow = {
  id: number;
  tenant_id: number;
  alert_type: AlertType;
  threshold: number;
  message: string;
  acknowledged: boolean;
  created_at: Date | string;
};

const ALERT_THRESHOLDS = [75, 90, 100] as const;

const ALERT_TYPES: Record<(typeof ALERT_THRESHOLDS)[number], AlertType> = {
  75: 'budget_warning',
  90: 'budget_critical',
  100: 'budget_exceeded',
};

function buildAlertMessage(threshold: (typeof ALERT_THRESHOLDS)[number]): string {
  if (threshold === 100) {
    return 'Usage reached 100% of monthly budget';
  }
  return `Usage reached ${threshold}% of monthly budget`;
}

function normalizeBudgetLimit(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getMonthlyPeriodBounds(now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { periodStart, periodEnd };
}

function mapAlertRow(row: AlertRow): Alert {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    alertType: row.alert_type,
    threshold: row.threshold,
    message: row.message,
    acknowledged: row.acknowledged,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function getBudgetLimit(tenantId: number): Promise<number | null> {
  const settingsResult = await db.execute(sql`
    SELECT settings
    FROM tenant_settings
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `);

  const settings = (settingsResult.rows[0] as { settings?: { tokenLimitMonthly?: unknown } } | undefined)?.settings;
  return normalizeBudgetLimit(settings?.tokenLimitMonthly);
}

export async function listUnacknowledgedAlerts(tenantId: number): Promise<Alert[]> {
  const result = await db.execute(sql`
    SELECT
      id,
      tenant_id,
      alert_type,
      threshold,
      message,
      acknowledged,
      created_at
    FROM usage_alerts
    WHERE tenant_id = ${tenantId}
      AND acknowledged = false
    ORDER BY created_at DESC
  `);

  return result.rows.map((row) => mapAlertRow(row as AlertRow));
}

export async function acknowledgeAlert(tenantId: number, alertId: number): Promise<Alert | null> {
  const result = await db.execute(sql`
    UPDATE usage_alerts
    SET acknowledged = true
    WHERE id = ${alertId}
      AND tenant_id = ${tenantId}
    RETURNING
      id,
      tenant_id,
      alert_type,
      threshold,
      message,
      acknowledged,
      created_at
  `);

  const row = result.rows[0] as AlertRow | undefined;
  return row ? mapAlertRow(row) : null;
}

export async function checkAlerts(tenantId: number): Promise<Alert[]> {
  const budgetLimit = await getBudgetLimit(tenantId);
  if (!budgetLimit) return [];

  const { periodStart, periodEnd } = getMonthlyPeriodBounds();

  const usageResult = await db.execute(sql`
    SELECT COALESCE(SUM(tokens), 0)::bigint AS total_tokens
    FROM agent_stats
    WHERE tenant_id = ${tenantId}
      AND recorded_at >= ${periodStart}
      AND recorded_at < ${periodEnd}
  `);

  const totalTokens = Number((usageResult.rows[0] as { total_tokens?: string | number } | undefined)?.total_tokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return [];

  const latestWriteResult = await db.execute(sql`
    SELECT tokens
    FROM agent_stats
    WHERE tenant_id = ${tenantId}
      AND recorded_at >= ${periodStart}
      AND recorded_at < ${periodEnd}
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `);

  const latestTokens = Number((latestWriteResult.rows[0] as { tokens?: string | number } | undefined)?.tokens ?? 0);
  const previousTokens = Math.max(0, totalTokens - (Number.isFinite(latestTokens) ? Math.max(0, latestTokens) : 0));

  const previousPercent = (previousTokens / budgetLimit) * 100;
  const currentPercent = (totalTokens / budgetLimit) * 100;

  const crossedThresholds = ALERT_THRESHOLDS.filter((threshold) => previousPercent < threshold && currentPercent >= threshold);
  if (crossedThresholds.length === 0) return [];

  const existingResult = await db.execute(sql`
    SELECT threshold
    FROM usage_alerts
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${periodStart}
      AND created_at < ${periodEnd}
  `);

  const existingThresholds = new Set(
    existingResult.rows
      .map((row) => Number((row as { threshold?: number | string }).threshold))
      .filter((value) => Number.isFinite(value)),
  );

  const createdAlerts: Alert[] = [];
  for (const threshold of crossedThresholds) {
    if (existingThresholds.has(threshold)) continue;

    const inserted = await db.execute(sql`
      INSERT INTO usage_alerts (tenant_id, alert_type, threshold, message)
      VALUES (${tenantId}, ${ALERT_TYPES[threshold]}, ${threshold}, ${buildAlertMessage(threshold)})
      RETURNING
        id,
        tenant_id,
        alert_type,
        threshold,
        message,
        acknowledged,
        created_at
    `);

    const row = inserted.rows[0] as AlertRow | undefined;
    if (row) createdAlerts.push(mapAlertRow(row));
  }

  return createdAlerts;
}
