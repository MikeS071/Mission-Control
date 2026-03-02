import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const totalsResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(total_cost_usd::numeric), 0)::numeric(12,6)::text AS total_cost_usd,
      COALESCE(SUM(total_saved_usd::numeric), 0)::numeric(12,6)::text AS total_saved_usd
    FROM usage_summary
    WHERE tenant_id = ${tenantId}
  `);

  const totals = totalsResult.rows[0] as {
    total_cost_usd?: string;
    total_saved_usd?: string;
  } | undefined;

  const totalCostUsd = totals?.total_cost_usd ?? '0.000000';
  const totalSavedUsd = totals?.total_saved_usd ?? '0.000000';
  const cost = Number(totalCostUsd);
  const saved = Number(totalSavedUsd);
  const savingsPct = cost > 0 ? ((saved / cost) * 100).toFixed(2) : '0.00';

  return NextResponse.json({
    totalCostUsd,
    totalSavedUsd,
    savingsPct,
  });
}
