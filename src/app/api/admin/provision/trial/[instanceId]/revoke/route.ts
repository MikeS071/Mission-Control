import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { provisionedInstances, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { deleteVPS } from '@/lib/provisioning';
import { auth } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
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

    const { instanceId } = await params;
    const instanceIdNum = parseInt(instanceId, 10);

    if (isNaN(instanceIdNum)) {
      return NextResponse.json({ error: 'Invalid instance ID' }, { status: 400 });
    }

    // Get instance
    const [instance] = await db
      .select()
      .from(provisionedInstances)
      .where(eq(provisionedInstances.id, instanceIdNum))
      .limit(1);

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    if (!instance.isTrial) {
      return NextResponse.json(
        { error: 'Can only revoke trial instances' },
        { status: 400 }
      );
    }

    // Delete droplet from DigitalOcean if it exists
    if (instance.dropletId) {
      try {
        await deleteVPS(instance.dropletId);
      } catch (error) {
        console.error('Error deleting droplet:', error);
        // Continue even if droplet deletion fails (might already be deleted)
      }
    }

    // Update instance status to 'failed' with revoked message
    await db
      .update(provisionedInstances)
      .set({
        status: 'failed',
        errorMessage: 'Trial instance revoked by admin',
        updatedAt: new Date(),
      })
      .where(eq(provisionedInstances.id, instanceIdNum));

    return NextResponse.json({
      success: true,
      message: 'Trial instance revoked successfully',
    });
  } catch (error) {
    console.error('Revoke API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
