import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { parsePeriod, resolveDateRange } from '@/app/api/usage/_shared';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = parsePeriod(searchParams.get('period'));
  if (!period) {
    return NextResponse.json({ error: 'period must be daily or monthly' }, { status: 400 });
  }

  const range = resolveDateRange(req);
  if (range.error) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  try {
    const result = await db.execute(sql`
      SELECT *
      FROM usage_summary
      WHERE tenant_id = ${tenantId}
        AND period = ${period}
        AND bucket_start >= ${range.from}
        AND bucket_start <= ${range.to}
      ORDER BY bucket_start ASC
    `);

    return NextResponse.json({ rows: result.rows });
  } catch (error) {
    console.error('Usage summary API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
