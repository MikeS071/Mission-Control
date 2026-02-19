import { db } from '@/lib/db';
import { heartbeats } from '@/db/schema';

const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';

// Default to tenant 1 (Mike's workspace) for the background heartbeat worker
const DEFAULT_TENANT_ID = 1;

async function writeHeartbeat(source: string, status: string, payload: string, checkedAt: Date) {
  try {
    await db.insert(heartbeats).values({ tenantId: DEFAULT_TENANT_ID, source, status, payload, checkedAt });
  } catch (error) {
    console.error('Failed to write heartbeat', error);
  }
}

export async function checkGateway() {
  const checkedAt = new Date();
  try {
    const res = await fetch(gatewayUrl, { cache: 'no-store' });
    const payload = await res.text();
    await writeHeartbeat('gateway', res.ok ? 'ok' : 'error', payload, checkedAt);
  } catch (error) {
    const payload = JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
    await writeHeartbeat('gateway', 'error', payload, checkedAt);
  }
}

export async function runHeartbeats() {
  await checkGateway();
}

let heartbeatTimer: NodeJS.Timeout | null = null;

export function startHeartbeatWorker() {
  if (heartbeatTimer) return;

  void runHeartbeats();
  heartbeatTimer = setInterval(() => {
    void runHeartbeats();
  }, 60_000);
}
