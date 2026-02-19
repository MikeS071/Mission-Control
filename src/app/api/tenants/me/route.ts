import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, memberships } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const members = await db
    .select()
    .from(memberships)
    .where(eq(memberships.tenantId, tenantId));

  return NextResponse.json({ ...tenant, memberCount: members.length });
}
