/**
 * Chat Inbound Relay
 * POST /api/chat/inbound
 *
 * Accepts messages relayed from the OpenClaw Telegram session and stores them
 * in chat_messages so the existing SSE stream pushes them to the MC browser UI.
 *
 * Auth: shared secret in X-Relay-Secret header (MC_INBOUND_SECRET env var).
 *
 * Body: { tenantId: number, role: "user" | "assistant", content: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';

const INBOUND_SECRET = process.env.MC_INBOUND_SECRET;

export async function POST(req: NextRequest) {
  // ── Secret auth ───────────────────────────────────────────────────────────
  if (!INBOUND_SECRET) {
    console.error('[chat/inbound] MC_INBOUND_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }

  const secret = req.headers.get('x-relay-secret');
  if (!secret || secret !== INBOUND_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tenantId, role, content } = (body ?? {}) as {
    tenantId?: unknown;
    role?: unknown;
    content?: unknown;
  };

  if (typeof tenantId !== 'number' || !Number.isInteger(tenantId)) {
    return NextResponse.json({ error: 'tenantId must be an integer' }, { status: 400 });
  }
  if (role !== 'user' && role !== 'assistant') {
    return NextResponse.json({ error: 'role must be "user" or "assistant"' }, { status: 400 });
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({ tenantId, role, content: content.trim() })
      .returning({ id: chatMessages.id });

    return NextResponse.json({ ok: true, messageId: inserted.id });
  } catch (err) {
    console.error('[chat/inbound] DB error:', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
