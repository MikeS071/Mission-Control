/**
 * Chat API
 * POST /api/chat
 *
 * Accepts:  { message: string }
 * Returns:  { reply: string, messageId: number }
 *           { reply: string, error: true }  — on AiPipe failure
 *
 * Flow:
 *  1. Require NextAuth session → extract tenantId
 *  2. Save user message to chat_messages table
 *  3. Load last 10 messages as context
 *  4. POST to AiPipe at AIPIPE_URL/v1/chat/completions
 *  5. Save assistant reply to DB
 *  6. Return { reply, messageId }
 */
import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';

const SYSTEM_PROMPT =
  'You are an AI assistant integrated into ArchonHQ Mission Control. ' +
  'Help the user manage their AI agents, tasks, and workspace.';

const AIPIPE_URL = process.env.AIPIPE_URL ?? 'http://127.0.0.1:8082';
const MODEL = 'gpt-4o-mini';
const CONTEXT_MESSAGES = 10;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant associated with session' }, { status: 403 });
  }

  // ── Validate body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message } = body as { message?: unknown };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required and must be a non-empty string' }, { status: 400 });
  }

  const userContent = message.trim();

  // ── Save user message ─────────────────────────────────────────────────────
  let userMsgId: number;
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({ tenantId, role: 'user', content: userContent })
      .returning({ id: chatMessages.id });
    userMsgId = inserted.id;
  } catch (err) {
    console.error('[chat] Failed to save user message:', err);
    return NextResponse.json({ error: 'Database error saving message' }, { status: 500 });
  }

  // ── Load conversation context ──────────────────────────────────────────────
  let historyRows: Array<{ role: string; content: string }>;
  try {
    // Get the last CONTEXT_MESSAGES messages (excluding the one we just inserted)
    const recent = await db
      .select({ role: chatMessages.role, content: chatMessages.content, id: chatMessages.id })
      .from(chatMessages)
      .where(eq(chatMessages.tenantId, tenantId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(CONTEXT_MESSAGES + 1);

    // Exclude the message we just inserted, reverse to chronological order
    historyRows = recent
      .filter((r) => r.id !== userMsgId)
      .slice(0, CONTEXT_MESSAGES)
      .reverse()
      .map(({ role, content }) => ({ role, content }));
  } catch (err) {
    console.error('[chat] Failed to load history:', err);
    historyRows = [];
  }

  // Build messages array for AiPipe
  const contextMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyRows,
    { role: 'user', content: userContent },
  ];

  // ── Call AiPipe ───────────────────────────────────────────────────────────
  let reply: string;
  try {
    const aiRes = await fetch(`${AIPIPE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': String(tenantId),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: contextMessages,
      }),
      // 30-second timeout via AbortSignal
      signal: AbortSignal.timeout(30_000),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '(no body)');
      console.error(`[chat] AiPipe responded ${aiRes.status}: ${errText}`);
      throw new Error(`AiPipe HTTP ${aiRes.status}`);
    }

    const aiJson = (await aiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = aiJson?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Unexpected AiPipe response shape');
    }
    reply = content.trim();
  } catch (err) {
    console.error('[chat] AiPipe call failed:', err);

    // Still return a graceful error reply rather than a 5xx
    return NextResponse.json({
      reply: 'Agent unavailable — check your AiPipe configuration.',
      error: true,
    });
  }

  // ── Save assistant reply ───────────────────────────────────────────────────
  let assistantMsgId: number = 0;
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({ tenantId, role: 'assistant', content: reply })
      .returning({ id: chatMessages.id });
    assistantMsgId = inserted.id;
  } catch (err) {
    console.error('[chat] Failed to save assistant reply:', err);
    // Non-fatal: still return the reply to the user
  }

  return NextResponse.json({ reply, messageId: assistantMsgId });
}
