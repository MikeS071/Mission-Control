import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (source)
      id,
      source,
      status,
      payload,
      checked_at AS "checkedAt"
    FROM heartbeats
    WHERE tenant_id = ${tenantId}
    ORDER BY source, checked_at DESC
  `);

  return NextResponse.json(rows.rows);
}
