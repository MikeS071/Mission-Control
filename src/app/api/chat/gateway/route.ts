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

const GATEWAY_URL   = process.env.GATEWAY_URL            ?? 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? 'cc68b7fe544ea32d1708115c67da65b55553eee215df3bff';
const CONTEXT_LIMIT = 10;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const tenantId = await resolveTenantId(req);
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
  } catch (err) {
    console.error('[chat/gateway] DB insert user msg:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  // ── Build conversation context ────────────────────────────────────────────
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.tenantId, tenantId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(CONTEXT_LIMIT + 1);

  const contextMessages = history
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── Call OpenClaw gateway ─────────────────────────────────────────────────
  // Use a stable per-tenant MC session so context persists across reloads.
  const sessionKey = `web:mc:${tenantId}`;

  let reply = '';
  try {
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
    });

    if (!gwRes.ok) {
      const errText = await gwRes.text().catch(() => '');
      console.error('[chat/gateway] Gateway error:', gwRes.status, errText);
      // Fall back gracefully
      reply = `[Gateway error ${gwRes.status}] I couldn't process that right now.`;
    } else {
      const data = (await gwRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      reply = data.choices?.[0]?.message?.content?.trim() ?? '';
    }
  } catch (err) {
    console.error('[chat/gateway] Fetch error:', err);
    reply = 'Gateway unreachable — check that the OpenClaw gateway is running.';
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
  } catch (err) {
    console.error('[chat/gateway] DB insert assistant msg:', err);
    // Non-fatal — reply was already computed
  }

  return NextResponse.json({
    reply,
    userMessageId: userMsgId,
    messageId: assistantMsgId,
  });
}
