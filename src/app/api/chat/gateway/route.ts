/**
 * Chat Gateway API
 * POST /api/chat/gateway
 *
 * Routes MC chat messages through the local OpenClaw gateway (agent: main)
 * instead of a standalone LLM. Stores both user message and assistant reply
 * in chat_messages so the existing SSE stream picks them up.
 *
 * Session key: stable per-tenant MC session ("web:mc:<tenantId>") so
 * conversation context persists across MC page loads.
 */
import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { wsManager } from '@/lib/ws-manager';

const GATEWAY_URL    = process.env.GATEWAY_URL            ?? 'http://127.0.0.1:18789';
const GATEWAY_TOKEN  = process.env.OPENCLAW_GATEWAY_TOKEN;
const API_SECRET     = process.env.API_SECRET; // optional: server-to-server auth bypass for smoke tests
const TG_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID     = process.env.TELEGRAM_CHAT_ID;

if (!GATEWAY_TOKEN) {
  console.error('[chat/gateway] OPENCLAW_GATEWAY_TOKEN is not set — requests will fail auth');
}

/**
 * Send a message to the Telegram channel — fire-and-forget, never throws.
 * No parse_mode: plain text only. User messages are uncontrolled input and
 * will break Markdown parsing, causing silent 400s from the Telegram API.
 */
async function sendToTelegram(text: string): Promise<void> {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.warn('[chat/gateway] sendToTelegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[chat/gateway] Telegram send failed ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[chat/gateway] Telegram send error:', err);
  }
}

/**
 * Telegram typing indicator (`sendChatAction`).
 * Must be repeated every few seconds while we wait for the gateway.
 */
async function sendTelegramTyping(): Promise<void> {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, action: 'typing' }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // best-effort only
  }
}

function startTelegramTyping(): () => void {
  // Initial poke so it feels instant.
  void sendTelegramTyping();

  const interval = setInterval(() => {
    void sendTelegramTyping();
  }, 4_500);

  return () => clearInterval(interval);
}

const CONTEXT_LIMIT = 10;
const MAX_CONTEXT_CHARS = 12_000;

export async function POST(req: NextRequest) {
  if (!GATEWAY_TOKEN) {
    return NextResponse.json({ error: 'Gateway not configured — OPENCLAW_GATEWAY_TOKEN missing' }, { status: 503 });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Normal path: NextAuth session cookies → resolveTenantId(req)
  // Smoke-test path: server-to-server API_SECRET (no cookies)
  const authz = req.headers.get('authorization') ?? '';
  const headerSecret = req.headers.get('x-api-secret') ?? '';
  const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';

  let tenantId: number | null = null;

  const apiSecretOk = !!API_SECRET && (bearer === API_SECRET || headerSecret === API_SECRET);
  if (apiSecretOk) {
    const hdrTenant = req.headers.get('x-tenant-id');
    const parsed = hdrTenant ? Number(hdrTenant) : NaN;
    tenantId = Number.isFinite(parsed) ? parsed : 1; // dev default
  } else {
    tenantId = await resolveTenantId(req);
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { message } = (body ?? {}) as { message?: unknown };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  const userContent = message.trim();

  // ── Persist user message ──────────────────────────────────────────────────
  let userMsgId: number;
  try {
    const [ins] = await db
      .insert(chatMessages)
      .values({ tenantId, role: 'user', content: userContent })
      .returning({ id: chatMessages.id });
    userMsgId = ins.id;
    wsManager.broadcast(tenantId, { id: userMsgId, role: 'user', content: userContent, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error('[chat/gateway] DB insert user msg:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  // ── Mirror user message to Telegram immediately (latency UX) ──────────────
  // NOTE: Telegram bots cannot impersonate the human sender; this is just a
  // text prefix to visually distinguish MC-mirrored user messages.
  void sendToTelegram(`👤 ${userContent}`);

  // ── Build conversation context ────────────────────────────────────────────
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.tenantId, tenantId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(CONTEXT_LIMIT + 1);

  // Keep context bounded so prompts don't explode and cause 30–60s latency spikes.
  // We cap by both message count and total characters.
  const chronological = history
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  let totalChars = 0;
  const contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  // Take from the end (most recent) backwards until we hit the cap, then re-reverse.
  for (let i = chronological.length - 1; i >= 0; i--) {
    const m = chronological[i];
    const len = (m.content ?? '').length;
    if (contextMessages.length >= CONTEXT_LIMIT) break;
    if (totalChars + len > MAX_CONTEXT_CHARS && contextMessages.length > 0) break;
    totalChars += len;
    contextMessages.push(m);
  }
  contextMessages.reverse();

  // ── Call OpenClaw gateway ─────────────────────────────────────────────────
  // IMPORTANT: OpenClaw may persist tool-call state per session key.
  // We already send recent DB history as context, so we can use a per-request
  // session key to avoid poisoned sessions causing "No tool call found...".
  const sessionKeyBase = `web:mc:${tenantId}:m${userMsgId}`;

  // Telegram native typing indicator while gateway is processing.
  const stopTelegramTyping = startTelegramTyping();

  async function callGateway(sessionKey: string): Promise<{ ok: boolean; status?: number; errText?: string; reply?: string }> {
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'x-openclaw-agent-id': 'main',
        'x-openclaw-session-key': sessionKey,
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: contextMessages,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(120_000), // 2-min ceiling; gateway can be slow
    });

    if (!gwRes.ok) {
      const errText = await gwRes.text().catch(() => '');
      return { ok: false, status: gwRes.status, errText };
    }

    const data = (await gwRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
    return { ok: true, reply };
  }

  let reply = '';
  let typingTimer: NodeJS.Timeout | null = null;
  let debugError: any = undefined;
  try {
    // Telegram UX: show typing indicator while OpenClaw is working
    void sendTelegramTyping();
    typingTimer = setInterval(() => {
      void sendTelegramTyping();
    }, 4500);

    const first = await callGateway(sessionKeyBase);
    if (!first.ok) {
      debugError = { kind: 'gateway_http', status: first.status, errText: first.errText };
      console.error('[chat/gateway] Gateway error:', first.status, first.errText);

      // Retry once if the upstream complains about tool-call mismatch / corrupted session.
      const isToolMismatch = (first.errText ?? '').includes('No tool call found') || (first.errText ?? '').includes('call_id');
      if (isToolMismatch) {
        const rotated = `${sessionKeyBase}:r1`;
        const second = await callGateway(rotated);
        if (second.ok) {
          reply = second.reply ?? '';
        } else {
          debugError = { kind: 'gateway_http_retry', status: second.status, errText: second.errText };
          console.error('[chat/gateway] Gateway retry error:', second.status, second.errText);
          reply = `[Gateway error ${second.status}] I couldn't process that right now.`;
        }
      } else {
        reply = `[Gateway error ${first.status}] I couldn't process that right now.`;
      }
    } else {
      reply = first.reply ?? '';
    }
  } catch (err: any) {
    const name = String(err?.name ?? 'Error');
    const msg = String(err?.message ?? err);
    const cause = err?.cause ? String(err.cause) : '';
    debugError = { kind: 'gateway_fetch', name, message: msg, cause, gatewayUrl: GATEWAY_URL };
    console.error('[chat/gateway] Fetch error:', { name, msg, cause, gatewayUrl: GATEWAY_URL });

    // Dev-friendly reply. In prod we still keep it human.
    if ((process.env.NODE_ENV ?? 'development') === 'development') {
      reply = `Gateway fetch failed (${name}): ${msg}`;
    } else {
      reply = 'Gateway unreachable — check that the OpenClaw gateway is running.';
    }
  } finally {
    if (typingTimer) clearInterval(typingTimer);
    typingTimer = null;
  }

  if (!reply) reply = '…';

  // ── Persist assistant reply ───────────────────────────────────────────────
  let assistantMsgId: number | undefined;
  try {
    const [ins] = await db
      .insert(chatMessages)
      .values({ tenantId, role: 'assistant', content: reply })
      .returning({ id: chatMessages.id });
    assistantMsgId = ins.id;
    wsManager.broadcast(tenantId, { id: assistantMsgId, role: 'assistant', content: reply, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error('[chat/gateway] DB insert assistant msg:', err);
    // Non-fatal — reply was already computed
  } finally {
    stopTelegramTyping();
  }

  // ── Mirror assistant reply to Telegram ────────────────────────────────────
  // (User message was mirrored immediately after insert.)
  void sendToTelegram(reply);

  const isDev = (process.env.NODE_ENV ?? 'development') === 'development';

  return NextResponse.json({
    reply,
    userMessageId: userMsgId,
    messageId: assistantMsgId,
    ...(isDev ? { debugError } : {}),
  });
}
