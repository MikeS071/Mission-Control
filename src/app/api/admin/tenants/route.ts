import { NextRequest, NextResponse } from 'next/server';
import { count, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberships, tenants, users } from '@/db/schema';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((session as { tenantId?: number }).tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const tenantRows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(tenants.createdAt);

  const userCountRows = await db
    .select({
      tenantId: memberships.tenantId,
      userCount: count(users.id),
    })
    .from(memberships)
    .innerJoin(users, eq(users.email, memberships.userEmail))
    .groupBy(memberships.tenantId);

  const userCountByTenantId = new Map(
    userCountRows.map((row) => [row.tenantId, Number(row.userCount) || 0]),
  );

  return NextResponse.json(
    tenantRows.map((tenant) => ({
      ...tenant,
      userCount: userCountByTenantId.get(tenant.id) ?? 0,
    })),
  );
}
