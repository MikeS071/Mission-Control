import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId) || alertId <= 0) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 });
  }

  const rowsResult = await db.execute(sql`
    UPDATE usage_alerts
    SET acknowledged = true
    WHERE id = ${alertId}
      AND tenant_id = ${tenantId}
    RETURNING id, alert_type, threshold, acknowledged
  `);

  const row = rowsResult.rows[0] as {
    id: number;
    alert_type: string;
    threshold: number;
    acknowledged: boolean;
  } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    alert: {
      id: row.id,
      alertType: row.alert_type,
      threshold: row.threshold,
      acknowledged: row.acknowledged,
    },
  });
}
