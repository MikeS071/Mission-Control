import { and, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import os from 'os';
import { db } from '@/lib/db';
import { chatMessages, telegramLinks, telegramUpdates } from '@/db/schema';
import { openclawChatCompletion } from '@/lib/openclaw-gateway';
import { telegramSendChatAction, telegramSendMessage } from '@/lib/telegram-bot';
import { wsManager } from '@/lib/ws-manager';

const WORKER_ID = `${os.hostname()}:pid${process.pid}`;

function backoffMs(attempts: number): number {
  // 30s, 60s, 2m, 5m, 10m (cap)
  const seq = [30_000, 60_000, 120_000, 300_000, 600_000];
  return seq[Math.min(attempts, seq.length - 1)];
}

async function processOne(updateId: number): Promise<void> {
  const [u] = await db
    .select()
    .from(telegramUpdates)
    .where(eq(telegramUpdates.updateId, updateId))
    .limit(1);

  if (!u) return;
  if (!u.telegramUserId || !u.telegramChatId || !u.text) {
    await db
      .update(telegramUpdates)
      .set({ processedAt: new Date(), status: 'ignored', error: 'missing payload for retry' })
      .where(eq(telegramUpdates.updateId, updateId));
    return;
  }

  // Resolve link (tenantId/userId). If missing, stop retrying.
  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(and(eq(telegramLinks.telegramUserId, u.telegramUserId), isNull(telegramLinks.revokedAt)))
    .limit(1);

  if (!link) {
    await db
      .update(telegramUpdates)
      .set({ processedAt: new Date(), status: 'denied', error: 'unlinked user (retry worker)' })
      .where(eq(telegramUpdates.updateId, updateId));
    return;
  }

  // Typing indicator while we wait.
  const chatId = u.telegramChatId;
  void telegramSendChatAction(chatId, 'typing');
  const typingTimer = setInterval(() => void telegramSendChatAction(chatId, 'typing'), 4500);

  try {
    // Use a per-update session key to avoid a poisoned long-lived session
    // stalling all subsequent Telegram messages.
    const sessionKey = `tg:${link.tenantId}:${u.telegramUserId}:upd${u.updateId}`;
    const reply = await openclawChatCompletion({
      sessionKey,
      messages: [{ role: 'user', content: u.text }],
      maxTokens: 768,
      timeoutMs: 30_000,
    });

    // Persist assistant reply
    const [inserted] = await db
      .insert(chatMessages)
      .values({ tenantId: link.tenantId, role: 'assistant', content: reply, source: 'telegram' })
      .returning({ id: chatMessages.id, createdAt: chatMessages.createdAt });

    if (inserted?.id) {
      wsManager.broadcast(link.tenantId, {
        id: inserted.id,
        role: 'assistant',
        content: reply,
        createdAt: inserted.createdAt.toISOString(),
      });
    }

    await telegramSendMessage(chatId, reply);

    await db
      .update(telegramUpdates)
      .set({
        tenantId: link.tenantId,
        telegramUserId: u.telegramUserId,
        processedAt: new Date(),
        status: 'forwarded',
        error: null,
        nextAttemptAt: null,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(telegramUpdates.updateId, updateId));
  } catch (err: any) {
    const errText = String(err?.message ?? err);

    // Increment attempts and schedule next retry.
    const next = new Date(Date.now() + backoffMs((u.attempts ?? 0) + 1));

    await db
      .update(telegramUpdates)
      .set({
        tenantId: link.tenantId,
        telegramUserId: u.telegramUserId,
        status: 'error',
        error: errText,
        processedAt: null,
        lastAttemptAt: new Date(),
        attempts: sql`${telegramUpdates.attempts} + 1`,
        nextAttemptAt: next,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(telegramUpdates.updateId, updateId));

    // If we've tried enough times, tell the user and stop.
    const attempts = (u.attempts ?? 0) + 1;
    if (attempts >= 5) {
      await telegramSendMessage(chatId, 'Still failing after multiple retries. The gateway may be down — try again later.');
      await db
        .update(telegramUpdates)
        .set({ processedAt: new Date(), status: 'error', nextAttemptAt: null })
        .where(eq(telegramUpdates.updateId, updateId));
    }
  } finally {
    clearInterval(typingTimer);
  }
}

export function startTelegramRetryWorker(): void {
  // Only run when configured.
  if (!process.env.MC_TELEGRAM_WEBHOOK_SECRET) return;

  const tick = async () => {
    try {
      const now = new Date();
      // Release stale locks (>2m)
      await db
        .update(telegramUpdates)
        .set({ lockedAt: null, lockedBy: null })
        .where(and(lt(telegramUpdates.lockedAt, new Date(Date.now() - 120_000)), eq(telegramUpdates.status, 'error')));

      // Find one due update to retry.
      const [due] = await db
        .select({ updateId: telegramUpdates.updateId })
        .from(telegramUpdates)
        .where(
          and(
            sql`${telegramUpdates.status} in ('queued','error')`,
            lte(telegramUpdates.nextAttemptAt, now),
            isNull(telegramUpdates.lockedAt),
          ),
        )
        .orderBy(telegramUpdates.nextAttemptAt)
        .limit(1);

      if (!due?.updateId) return;

      // Lock it.
      await db
        .update(telegramUpdates)
        .set({ lockedAt: new Date(), lockedBy: WORKER_ID })
        .where(eq(telegramUpdates.updateId, due.updateId));

      // Hard timeout guard: if anything inside processOne hangs (network/undici/etc),
      // we still unlock and reschedule so the system can self-heal.
      await Promise.race([
        processOne(due.updateId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('retry worker timeout')), 45_000)),
      ]);
    } catch (err: any) {
      console.error('[telegram-retry-worker] tick error:', err?.message ?? err);

      // Best-effort unlock on any unexpected failure.
      try {
        await db
          .update(telegramUpdates)
          .set({ lockedAt: null, lockedBy: null, status: 'error', error: String(err?.message ?? err), nextAttemptAt: new Date(Date.now() + 30_000) })
          .where(and(eq(telegramUpdates.lockedBy, WORKER_ID), eq(telegramUpdates.status, 'queued')));
      } catch {
        // ignore
      }
    }
  };

  // Run frequently; backoff is controlled by nextAttemptAt.
  setInterval(() => void tick(), 5_000);
  void tick();
}
