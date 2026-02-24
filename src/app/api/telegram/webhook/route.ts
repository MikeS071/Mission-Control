import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatMessages, telegramLinks, telegramLinkTokens, telegramUpdates } from '@/db/schema';
import { openclawChatCompletion } from '@/lib/openclaw-gateway';
import { authorizeInbound } from '@/lib/policy';
import { telegramSendChatAction, telegramSendMessage } from '@/lib/telegram-bot';
import { isMcTelegramBridgeEnabled } from '@/lib/telegram-ingress';
import { wsManager } from '@/lib/ws-manager';
import { wsManager } from '@/lib/ws-manager';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    date?: number;
    chat: { id: number; type: string };
    from?: { id: number; is_bot?: boolean; username?: string };
  };
};

function getSecret(req: NextRequest): string {
  return req.headers.get('x-telegram-bot-api-secret-token') ?? '';
}

export async function POST(req: NextRequest) {
  try {
    const expected = process.env.MC_TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!expected || getSecret(req) !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
    if (!update?.update_id) return NextResponse.json({ ok: true });

  // Idempotency: insert update_id; if already exists return 200.
  // Also persist enough payload to allow retries if background processing dies.
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const telegramUserId = msg?.from?.id;
  const text = (msg?.text ?? '').trim();

  try {
    await db.insert(telegramUpdates).values({
      updateId: update.update_id,
      telegramChatId: chatId,
      telegramUserId,
      telegramMessageId: msg?.message_id,
      text,
      status: 'ignored',
      attempts: 0,
    });
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (!chatId) return NextResponse.json({ ok: true });

  if (!telegramUserId) return NextResponse.json({ ok: true });
  if (msg.from?.is_bot) return NextResponse.json({ ok: true });

  // /start <token>
  if (text.toLowerCase().startsWith('/start')) {
    const token = text.split(' ')[1]?.trim();
    if (!token) {
      await telegramSendMessage(chatId, 'Missing token. Please click Connect Telegram in Mission Control again.');
      return NextResponse.json({ ok: true });
    }

    const [tok] = await db
      .select()
      .from(telegramLinkTokens)
      .where(and(eq(telegramLinkTokens.token, token), isNull(telegramLinkTokens.consumedAt)))
      .limit(1);

    if (!tok || tok.expiresAt.getTime() < Date.now()) {
      await telegramSendMessage(chatId, 'That link token is invalid or expired. Please click Connect Telegram in Mission Control again.');
      return NextResponse.json({ ok: true });
    }

    await db
      .update(telegramLinkTokens)
      .set({ consumedAt: new Date() })
      .where(eq(telegramLinkTokens.token, token));

    // Upsert link by telegram_user_id
    const existing = await db
      .select({ id: telegramLinks.id })
      .from(telegramLinks)
      .where(eq(telegramLinks.telegramUserId, telegramUserId))
      .limit(1);

    if (existing[0]?.id) {
      await db
        .update(telegramLinks)
        .set({ tenantId: tok.tenantId, userId: tok.userId, telegramChatId: chatId, revokedAt: null })
        .where(eq(telegramLinks.id, existing[0].id));
    } else {
      await db.insert(telegramLinks).values({
        tenantId: tok.tenantId,
        userId: tok.userId,
        telegramUserId,
        telegramChatId: chatId,
      });
    }

    await db
      .update(telegramUpdates)
      .set({ tenantId: tok.tenantId, telegramUserId, processedAt: new Date(), status: 'linked' })
      .where(eq(telegramUpdates.updateId, update.update_id));

    await telegramSendMessage(chatId, 'Connected ✅');
    return NextResponse.json({ ok: true });
  }

  // Normal message: must be linked.
  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(and(eq(telegramLinks.telegramUserId, telegramUserId), isNull(telegramLinks.revokedAt)))
    .limit(1);

  if (!link) {
    await telegramSendMessage(chatId, 'Not connected. Open Mission Control → Connect → Telegram, then click the deep-link again.');
    await db
      .update(telegramUpdates)
      .set({ telegramUserId, processedAt: new Date(), status: 'denied', error: 'unlinked user' })
      .where(eq(telegramUpdates.updateId, update.update_id));
    return NextResponse.json({ ok: true });
  }

  // Gate (stub allow-all for now)
  const gate = await authorizeInbound({
    tenantId: link.tenantId,
    userId: link.userId,
    telegramUserId,
    kind: 'telegram_message',
    content: text,
  });

  if (!gate.allow) {
    await telegramSendMessage(chatId, gate.reason ?? 'Request denied by policy.');
    await db
      .update(telegramUpdates)
      .set({ tenantId: link.tenantId, telegramUserId, processedAt: new Date(), status: 'denied', error: gate.reason })
      .where(eq(telegramUpdates.updateId, update.update_id));
    return NextResponse.json({ ok: true });
  }

  // Persist inbound (idempotent) + broadcast to live MC chat
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({
        tenantId: link.tenantId,
        role: 'user',
        content: text,
        source: 'telegram',
        externalId: msg.message_id,
      })
      .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });

    if (inserted?.id) {
      wsManager.broadcast(link.tenantId, {
        id: inserted.id,
        role: 'user',
        content: text,
        createdAt: inserted.createdAt.toISOString(),
      });
    }
  } catch (err: any) {
    // Unique index on (tenant_id, source, external_id) WHERE external_id IS NOT NULL
    // makes Telegram ingress idempotent.
    if (err?.code !== '23505') throw err;
  }

  // UX: keep chat active without sending a noisy "Processing" message bubble.
  // Telegram supports chat actions (typing) which show an activity indicator.
  void telegramSendChatAction(chatId, 'typing');

  let typingTimer: NodeJS.Timeout | null = setInterval(() => {
    void telegramSendChatAction(chatId, 'typing');
  }, 4500);

  // Reliability: do NOT rely on fire-and-forget inside the request lifecycle.
  // Instead, enqueue the work in DB and let the retry worker process it.
  await db
    .update(telegramUpdates)
    .set({
      tenantId: link.tenantId,
      telegramUserId,
      status: 'queued',
      error: null,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(telegramUpdates.updateId, update.update_id));

  if (typingTimer) clearInterval(typingTimer);
  typingTimer = null;

  return NextResponse.json({ ok: true });
  } catch (err) {
    // Never let this endpoint throw — Telegram treats non-200 as retry-worthy,
    // which amplifies duplicates and delays.
    console.error('[telegram/webhook] Unhandled error:', err);
    return NextResponse.json({ ok: true });
  }
}
