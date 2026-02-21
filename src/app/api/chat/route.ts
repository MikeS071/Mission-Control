/**
 * Chat API — Scaffold / Stub
 * POST /api/chat
 *
 * Accepts: { message: string, tenantId: number | string }
 * Returns: { reply: string }
 *
 * TODO: Full implementation spec
 * -------------------------------------------------------
 * Transport:    Replace HTTP polling with SSE or WebSocket
 *               for real-time streaming responses.
 *
 * Persistence:  Persist messages to `chat_messages` table
 *               (see drizzle/migrations/0007_chat.sql).
 *               Load conversation history per tenant/thread.
 *
 * Agent routing: Route chat messages through AiPipe
 *               (POST /api/aipipe/proxy/chat) with the
 *               tenant's configured main agent model.
 *               Support @agent mentions to route to
 *               specific agent roles (planner, codeAgent…).
 *
 * Threads:      Add threadId support for multi-topic
 *               conversations (already in roadmap).
 *
 * Auth:         Require session auth (NextAuth) or Bearer
 *               token for API clients.
 * -------------------------------------------------------
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message } = body as { message?: unknown; tenantId?: unknown };

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Stub response — full agent routing via AiPipe coming in the next sprint
  return NextResponse.json({
    reply: 'Chat backend coming soon. This feature is under active development.',
  });
}
