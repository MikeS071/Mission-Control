import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { parseGroupBy, resolveDateRange } from '@/app/api/usage/_shared';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupBy = parseGroupBy(searchParams.get('groupBy'));
  if (!groupBy) {
    return NextResponse.json({ error: 'groupBy must be model or provider' }, { status: 400 });
  }

  const range = resolveDateRange(req);
  if (range.error) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const groupExpr = sql`CASE WHEN ${groupBy} = 'provider' THEN provider ELSE model END`;

  try {
    const result = await db.execute(sql`
      SELECT
        ${groupExpr} AS group_key,
        COALESCE(SUM(tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(cost_usd::numeric), 0)::numeric(12,4)::text AS total_cost_usd,
        COUNT(*)::bigint AS total_requests
      FROM usage_ledger
      WHERE tenant_id = ${tenantId}
        AND recorded_at >= ${range.from}
        AND recorded_at <= ${range.to}
      GROUP BY ${groupExpr}
      ORDER BY total_cost_usd::numeric DESC, group_key ASC
    `);

    return NextResponse.json({ rows: result.rows });
  } catch (error) {
    console.error('Usage breakdown API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
