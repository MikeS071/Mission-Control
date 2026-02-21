/**
 * Heartbeat alert endpoint
 * POST /api/heartbeat/alert
 *
 * Accepts: { type: "gateway_down" | "stale_heartbeat", lastSeen: string, agentId?: string }
 * Requires: Authorization: Bearer {API_SECRET}
 * Sends a Telegram alert and returns { sent: true }
 */
import { NextRequest, NextResponse } from 'next/server';

const API_SECRET        = process.env.API_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID ?? '';

type AlertType = 'gateway_down' | 'stale_heartbeat';

interface AlertBody {
  type: AlertType;
  lastSeen: string;
  agentId?: string;
}

function requireBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return !!API_SECRET && auth.slice(7).trim() === API_SECRET;
}

function buildMessage(body: AlertBody): string {
  const emoji = body.type === 'gateway_down' ? '🔴' : '⚠️';
  const typeLabel = body.type === 'gateway_down' ? 'Gateway is DOWN' : 'Stale Heartbeat Detected';
  const lastSeenLabel = body.lastSeen
    ? `Last seen: ${new Date(body.lastSeen).toUTCString()}`
    : 'Last seen: unknown';
  const agentLine = body.agentId ? `\nAgent: ${body.agentId}` : '';

  return (
    `${emoji} *[Mission Control Alert]*\n` +
    `*${typeLabel}*\n` +
    `${lastSeenLabel}${agentLine}\n\n` +
    `Check the gateway status at https://archonhq.ai/dashboard`
  );
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[heartbeat/alert] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return false;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[heartbeat/alert] Telegram sendMessage failed:', res.status, err);
    return false;
  }

  return true;
}

export async function POST(req: NextRequest) {
  if (!requireBearer(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, lastSeen, agentId } = body as Partial<AlertBody>;

  if (type !== 'gateway_down' && type !== 'stale_heartbeat') {
    return NextResponse.json(
      { error: 'type must be "gateway_down" or "stale_heartbeat"' },
      { status: 400 }
    );
  }

  if (!lastSeen || typeof lastSeen !== 'string') {
    return NextResponse.json({ error: 'lastSeen is required (ISO date string)' }, { status: 400 });
  }

  const message = buildMessage({ type, lastSeen, agentId });
  const sent = await sendTelegram(message);

  if (!sent) {
    return NextResponse.json({ sent: false, error: 'Failed to send Telegram alert' }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
