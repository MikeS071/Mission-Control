import { db } from '@/lib/db';
import { heartbeats } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';

// Default to tenant 1 (Mike's workspace) for the background heartbeat worker
const DEFAULT_TENANT_ID = 1;

// Alert if last successful heartbeat is older than this threshold
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Internal URL for the alert endpoint (same process)
const ALERT_URL =
  process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/heartbeat/alert`
    : 'http://127.0.0.1:3003/api/heartbeat/alert';

async function writeHeartbeat(source: string, status: string, payload: string, checkedAt: Date) {
  try {
    await db.insert(heartbeats).values({ tenantId: DEFAULT_TENANT_ID, source, status, payload, checkedAt });
  } catch (error) {
    console.error('Failed to write heartbeat', error);
  }
}

/** Check the gateway and write a heartbeat record. */
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

/**
 * Check whether the most recent successful gateway heartbeat is stale.
 * If so, POST to /api/heartbeat/alert to send a Telegram notification.
 * Non-fatal: errors are logged but do not throw.
 */
async function checkForStaleHeartbeat() {
  try {
    // Find the latest 'ok' heartbeat for the gateway source
    const rows = await db
      .select({ checkedAt: heartbeats.checkedAt })
      .from(heartbeats)
      .where(eq(heartbeats.source, 'gateway'))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(1);

    if (!rows.length) {
      // No heartbeat recorded yet — not necessarily stale, skip
      return;
    }

    const lastCheckedAt = rows[0].checkedAt;
    if (!lastCheckedAt) return;

    const ageMs = Date.now() - lastCheckedAt.getTime();
    if (ageMs < STALE_THRESHOLD_MS) return; // fresh enough

    console.warn(
      `[heartbeat] Stale gateway heartbeat detected — last seen ${Math.round(ageMs / 1000)}s ago. Sending alert.`
    );

    const apiSecret = process.env.API_SECRET ?? '';
    await fetch(ALERT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSecret}`,
      },
      body: JSON.stringify({
        type: 'stale_heartbeat',
        lastSeen: lastCheckedAt.toISOString(),
      }),
    }).catch((err) => {
      console.error('[heartbeat] Failed to POST alert:', err);
    });
  } catch (err) {
    console.error('[heartbeat] checkForStaleHeartbeat error (non-fatal):', err);
  }
}

export async function runHeartbeats() {
  await checkGateway();
  // Run stale check asynchronously — don't block the heartbeat write
  void checkForStaleHeartbeat();
}

let heartbeatTimer: NodeJS.Timeout | null = null;

export function startHeartbeatWorker() {
  if (heartbeatTimer) return;

  void runHeartbeats();
  heartbeatTimer = setInterval(() => {
    void runHeartbeats();
  }, 60_000);
}
