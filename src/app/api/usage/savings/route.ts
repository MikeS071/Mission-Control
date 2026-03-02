import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(total_saved_usd::numeric), 0)::numeric(12,4)::text AS total_saved_usd,
        COALESCE(SUM((total_cost_usd::numeric + total_saved_usd::numeric)), 0)::numeric(12,4)::text AS hypothetical_total_usd
      FROM usage_summary
      WHERE tenant_id = ${tenantId}
    `);

    const row = (result.rows[0] ?? {
      total_saved_usd: '0.0000',
      hypothetical_total_usd: '0.0000',
    }) as { total_saved_usd?: string; hypothetical_total_usd?: string };

    const totalSaved = Number.parseFloat(row.total_saved_usd ?? '0');
    const hypotheticalTotal = Number.parseFloat(row.hypothetical_total_usd ?? '0');
    const pct = hypotheticalTotal > 0 ? (totalSaved / hypotheticalTotal) * 100 : 0;

    return NextResponse.json({
      totalSavedUsd: (row.total_saved_usd ?? '0.0000'),
      hypotheticalTotalUsd: (row.hypothetical_total_usd ?? '0.0000'),
      savingsPct: pct.toFixed(2),
    });
  } catch (error) {
    console.error('Usage savings API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
