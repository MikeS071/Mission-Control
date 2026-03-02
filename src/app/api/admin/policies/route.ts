import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { policies, tenants } from '@/db/schema';
import { resolveRules, type TenantPolicyRow } from '@/lib/policy/admin';

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if ((session as { tenantId?: number }).tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

export async function GET(_req: NextRequest) {
  try {
    const sessionOrResponse = await requireAdminSession();
    if (sessionOrResponse instanceof Response) return sessionOrResponse;

    const rows = await db
      .select({
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantPlan: tenants.plan,
        tier: policies.tier,
        rules: policies.rules,
        customOverrides: policies.customOverrides,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(tenants)
      .leftJoin(policies, eq(policies.tenantId, tenants.id))
      .orderBy(tenants.createdAt);

    return NextResponse.json(
      rows.map((row) => {
        const resolved = resolveRules(row as TenantPolicyRow);
        return {
          tenantId: row.tenantId,
          tenantName: row.tenantName,
          tier: resolved.tier,
          rules: resolved.rules,
          customOverrides: resolved.customOverrides,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    );
  } catch (error) {
    console.error('Admin policies list API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

