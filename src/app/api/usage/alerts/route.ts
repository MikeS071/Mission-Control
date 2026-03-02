import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rowsResult = await db.execute(sql`
    SELECT id, alert_type, threshold, message, acknowledged, created_at
    FROM usage_alerts
    WHERE tenant_id = ${tenantId}
      AND acknowledged = false
    ORDER BY created_at DESC
  `);

  const rows = rowsResult.rows as Array<{
    id: number;
    alert_type: string;
    threshold: number;
    message: string;
    acknowledged: boolean;
    created_at: string | Date;
  }>;

  return NextResponse.json({
    alerts: rows.map((row) => ({
      id: row.id,
      alertType: row.alert_type,
      threshold: row.threshold,
      message: row.message,
      acknowledged: row.acknowledged,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  });
}
