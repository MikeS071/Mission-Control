import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createVPS } from '@/lib/provisioning';
import { db } from '@/lib/db';
import { tenants, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

const TrialProvisionRequestSchema = z.object({
  tenantEmail: z.string().email(),
  plan: z.enum(['strategos', 'archon']),
  ttlHours: z.number().int().min(0).max(168), // Max 1 week
});

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin check: tenant ID must be 1
    const [userTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.ownerUserId, session.user.id as any))
      .limit(1);

    if (!userTenant || userTenant.id !== 1) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse and validate request
    const body = await req.json();
    const { tenantEmail, plan, ttlHours } = TrialProvisionRequestSchema.parse(body);

    // Find tenant by email (look up user first, then tenant)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, tenantEmail))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find tenant owned by this user
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.ownerUserId, user.id))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found for this user' }, { status: 404 });
    }

    // Create trial VPS
    const result = await createVPS({
      tenantId: tenant.id,
      plan,
      tenantEmail,
      isTrial: true,
      ttlHours: ttlHours || undefined,
    });

    return NextResponse.json({
      instanceId: result.instanceId,
      status: 'pending',
      message: 'Trial instance provisioning started',
    });
  } catch (error) {
    console.error('Trial provision API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
