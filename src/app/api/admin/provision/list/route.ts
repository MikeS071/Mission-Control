import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { provisionedInstances, tenants, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check: tenant ID must be 1
    if ((session as any).tenantId !== 1) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all provisioned instances with tenant info
    const instances = await db
      .select({
        id: provisionedInstances.id,
        tenantId: provisionedInstances.tenantId,
        dropletId: provisionedInstances.dropletId,
        dropletIp: provisionedInstances.dropletIp,
        status: provisionedInstances.status,
        errorMessage: provisionedInstances.errorMessage,
        plan: provisionedInstances.plan,
        isTrial: provisionedInstances.isTrial,
        ttlExpiresAt: provisionedInstances.ttlExpiresAt,
        createdAt: provisionedInstances.createdAt,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(provisionedInstances)
      .leftJoin(tenants, eq(provisionedInstances.tenantId, tenants.id))
      .orderBy(provisionedInstances.createdAt);

    // For each tenant, try to get owner email
    const instancesWithEmail = await Promise.all(
      instances.map(async (instance) => {
        const [tenant] = await db
          .select({ ownerUserId: tenants.ownerUserId })
          .from(tenants)
          .where(eq(tenants.id, instance.tenantId))
          .limit(1);

        let tenantEmail = 'unknown';
        if (tenant?.ownerUserId) {
          const [user] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, tenant.ownerUserId))
            .limit(1);
          tenantEmail = user?.email || 'unknown';
        }

        return {
          ...instance,
          tenantEmail,
        };
      })
    );

    return NextResponse.json({ instances: instancesWithEmail });
  } catch (error) {
    console.error('List API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
