import { db } from '@/lib/db';
import { provisionedInstances, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

const DO_API_BASE = 'https://api.digitalocean.com/v2';
const DO_API_KEY = process.env.DIGITALOCEAN_API_KEY;

interface CreateVPSParams {
  tenantId: number;
  plan: 'strategos' | 'archon';
  tenantEmail: string;
  isTrial?: boolean;
  ttlHours?: number;
}

interface VPSStatusResponse {
  ip: string | null;
  status: string;
}

function generateInstallScript(tenantName: string, tenantEmail: string): string {
  return `#!/bin/bash
# Archon OpenClaw provisioning script
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y curl git nodejs npm
npm install -g openclaw
openclaw init --non-interactive
# Inject tenant config
cat > /home/openclaw/.openclaw/workspace/USER.md << 'EOF'
# USER.md
Name: ${tenantName}
Email: ${tenantEmail}
EOF
openclaw gateway start
`;
}

export async function createVPS(params: CreateVPSParams): Promise<{ instanceId: number; dropletId: number | null }> {
  const { tenantId, plan, tenantEmail, isTrial = false, ttlHours } = params;

  if (!DO_API_KEY) {
    throw new Error('DIGITALOCEAN_API_KEY is not configured');
  }

  // Get tenant info for the install script
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  // Create provisioned_instances row (status: pending)
  const [instance] = await db
    .insert(provisionedInstances)
    .values({
      tenantId,
      plan,
      status: 'pending',
      isTrial,
      ttlExpiresAt: ttlHours ? new Date(Date.now() + ttlHours * 60 * 60 * 1000) : null,
    })
    .returning();

  try {
    // Create droplet via DigitalOcean API
    const dropletName = `archon-tenant-${tenantId}-${Date.now()}`;
    const size = plan === 'archon' ? 's-2vcpu-4gb' : 's-1vcpu-2gb';
    const installScript = generateInstallScript(tenant.name, tenantEmail);

    const response = await fetch(`${DO_API_BASE}/droplets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DO_API_KEY}`,
      },
      body: JSON.stringify({
        name: dropletName,
        region: 'sgp1',
        size,
        image: 'ubuntu-22-04-x64',
        tags: ['archon-tenant', `tenant-${tenantId}`],
        user_data: installScript,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DigitalOcean API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const dropletId = data.droplet?.id;

    if (!dropletId) {
      throw new Error('No droplet ID returned from DigitalOcean');
    }

    // Update row with droplet_id, status: 'creating'
    await db
      .update(provisionedInstances)
      .set({
        dropletId,
        status: 'creating',
        updatedAt: new Date(),
      })
      .where(eq(provisionedInstances.id, instance.id));

    // Start polling in background (fire-and-forget)
    pollAndUpdateInstance(instance.id).catch((error) => {
      console.error(`Polling error for instance ${instance.id}:`, error);
    });

    return { instanceId: instance.id, dropletId };
  } catch (error) {
    // Update instance with error
    await db
      .update(provisionedInstances)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: new Date(),
      })
      .where(eq(provisionedInstances.id, instance.id));

    throw error;
  }
}

export async function getVPSStatus(dropletId: number): Promise<VPSStatusResponse> {
  if (!DO_API_KEY) {
    throw new Error('DIGITALOCEAN_API_KEY is not configured');
  }

  const response = await fetch(`${DO_API_BASE}/droplets/${dropletId}`, {
    headers: {
      'Authorization': `Bearer ${DO_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`DigitalOcean API error: ${response.status}`);
  }

  const data = await response.json();
  const droplet = data.droplet;

  // Extract public IPv4
  const ip = droplet.networks?.v4?.find((net: any) => net.type === 'public')?.ip_address || null;

  return {
    ip,
    status: droplet.status, // 'new', 'active', etc.
  };
}

export async function pollAndUpdateInstance(instanceId: number): Promise<void> {
  const maxAttempts = 60; // Poll for up to 10 minutes (60 * 10 seconds)
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Get current instance state
    const [instance] = await db
      .select()
      .from(provisionedInstances)
      .where(eq(provisionedInstances.id, instanceId))
      .limit(1);

    if (!instance || !instance.dropletId) {
      console.error(`Instance ${instanceId} not found or has no droplet ID`);
      return;
    }

    if (instance.status === 'ready' || instance.status === 'failed') {
      // Already in terminal state
      return;
    }

    try {
      const vpsStatus = await getVPSStatus(instance.dropletId);

      // If droplet is active and has an IP, mark as ready
      if (vpsStatus.status === 'active' && vpsStatus.ip) {
        await db
          .update(provisionedInstances)
          .set({
            dropletIp: vpsStatus.ip,
            status: 'ready',
            updatedAt: new Date(),
          })
          .where(eq(provisionedInstances.id, instanceId));

        console.log(`Instance ${instanceId} is ready with IP ${vpsStatus.ip}`);
        return;
      }

      // Still creating/booting, wait and retry
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
    } catch (error) {
      console.error(`Error polling instance ${instanceId}:`, error);

      // If too many failures, mark as failed
      if (attempts > 5) {
        await db
          .update(provisionedInstances)
          .set({
            status: 'failed',
            errorMessage: 'Failed to poll droplet status',
            updatedAt: new Date(),
          })
          .where(eq(provisionedInstances.id, instanceId));
        return;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  // Timeout - mark as failed
  await db
    .update(provisionedInstances)
    .set({
      status: 'failed',
      errorMessage: 'Timeout waiting for droplet to become active',
      updatedAt: new Date(),
    })
    .where(eq(provisionedInstances.id, instanceId));
}

export async function deleteVPS(dropletId: number): Promise<void> {
  if (!DO_API_KEY) {
    throw new Error('DIGITALOCEAN_API_KEY is not configured');
  }

  const response = await fetch(`${DO_API_BASE}/droplets/${dropletId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${DO_API_KEY}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`DigitalOcean API error: ${response.status}`);
  }
}
