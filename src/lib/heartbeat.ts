import { db } from '@/lib/db';
import { heartbeats } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';

// Default to tenant 1 (Mike's workspace) for the background heartbeat worker
const DEFAULT_TENANT_ID = 1;

// Alert if last heartbeat is older than this threshold
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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
 * Send a Telegram alert directly (no HTTP round-trip to self).
 * Called when the heartbeat worker detects a stale heartbeat.
 */
async function sendStaleAlert(lastSeen: Date) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId   = process.env.TELEGRAM_CHAT_ID ?? '';

  if (!botToken || !chatId) {
    console.warn('[heartbeat] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — skipping stale alert');
    return;
  }

  const ageMin = Math.round((Date.now() - lastSeen.getTime()) / 60_000);
  const text =
    `⚠️ *[Mission Control Alert]*\n` +
    `*Stale Heartbeat Detected*\n` +
    `Last seen: ${lastSeen.toUTCString()} (${ageMin} min ago)\n\n` +
    `Check gateway status at https://archonhq.ai/dashboard`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error('[heartbeat] Telegram alert failed:', res.status, err);
    }
  } catch (err) {
    console.error('[heartbeat] Telegram alert error (non-fatal):', err);
  }
}

/**
 * Check whether the most recent gateway heartbeat is stale (> 5 min).
 * If so, send a Telegram alert directly. Non-fatal.
 */
async function checkForStaleHeartbeat() {
  try {
    const rows = await db
      .select({ checkedAt: heartbeats.checkedAt })
      .from(heartbeats)
      .where(eq(heartbeats.source, 'gateway'))
      .orderBy(desc(heartbeats.checkedAt))
      .limit(1);

    if (!rows.length) return; // No heartbeats yet — not stale

    const lastCheckedAt = rows[0].checkedAt;
    if (!lastCheckedAt) return;

    const ageMs = Date.now() - lastCheckedAt.getTime();
    if (ageMs < STALE_THRESHOLD_MS) return; // Still fresh

    console.warn(
      `[heartbeat] Stale gateway heartbeat — last seen ${Math.round(ageMs / 1000)}s ago. Sending Telegram alert.`
    );

    await sendStaleAlert(lastCheckedAt);
  } catch (err) {
    console.error('[heartbeat] checkForStaleHeartbeat error (non-fatal):', err);
  }
}

export async function runHeartbeats() {
  await checkGateway();
  // Stale check is async and non-blocking
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
