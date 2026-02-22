import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createVPS } from '@/lib/provisioning';
import { db } from '@/lib/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

const ProvisionRequestSchema = z.object({
  tenantId: z.number().int().positive(),
  plan: z.enum(['strategos', 'archon']),
});

export async function POST(req: NextRequest) {
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

    // Parse and validate request
    const body = await req.json();
    const { tenantId, plan } = ProvisionRequestSchema.parse(body);

    // Get tenant email
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get tenant owner's email (from the tenant's owner user)
    // For now, we'll use a placeholder - you may need to join with users table
    const tenantEmail = session.user.email; // Placeholder

    // Create VPS
    const result = await createVPS({
      tenantId,
      plan,
      tenantEmail,
    });

    return NextResponse.json({
      instanceId: result.instanceId,
      status: 'pending',
    });
  } catch (error) {
    console.error('Provision API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
