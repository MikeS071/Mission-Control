import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { provisionedInstances, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getVPSStatus, pollAndUpdateInstance } from '@/lib/provisioning';
import { auth } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // If status is 'creating' or 'configuring', poll DO for update
    if (
      (instance.status === 'creating' || instance.status === 'configuring') &&
      instance.dropletId
    ) {
      try {
        const vpsStatus = await getVPSStatus(instance.dropletId);

        // If now active and has IP, update to ready
        if (vpsStatus.status === 'active' && vpsStatus.ip && !instance.dropletIp) {
          await db
            .update(provisionedInstances)
            .set({
              dropletIp: vpsStatus.ip,
              status: 'ready',
              updatedAt: new Date(),
            })
            .where(eq(provisionedInstances.id, instanceIdNum));

          // Refresh instance data
          const [updatedInstance] = await db
            .select()
            .from(provisionedInstances)
            .where(eq(provisionedInstances.id, instanceIdNum))
            .limit(1);

          return NextResponse.json(updatedInstance);
        }
      } catch (error) {
        console.error('Error polling VPS status:', error);
        // Continue and return current instance state
      }
    }

    return NextResponse.json(instance);
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
