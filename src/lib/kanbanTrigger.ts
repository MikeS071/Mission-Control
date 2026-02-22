/**
 * Kanban Trigger — Fires when cards are created or moved to in_progress
 *
 * Actions:
 * 1. Log trigger to kanban_triggers table
 * 2. Save system chat message (visible in MC chat window)
 * 3. Send Telegram alert to Navi (fire-and-forget)
 */

import { db } from '@/lib/db';
import { chatMessages, kanbanTriggers } from '@/db/schema';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

export async function fireKanbanTrigger(
  tenantId: number,
  taskId: number,
  title: string,
  description: string | null,
  action: 'created' | 'moved_to_in_progress',
): Promise<void> {
  try {
    // 1. Log to kanban_triggers table
    await db.insert(kanbanTriggers).values({
      tenantId,
      taskId,
      taskTitle: title,
      taskDescription: description,
      action,
    });

    // 2. Save system chat message (so it appears in the MC chat window)
    const actionText = action === 'created' ? 'new card created' : 'moved to In Progress';
    const chatContent = `🃏 **Kanban trigger**: "${title}" — ${actionText}. I'll pick this up.`;

    await db.insert(chatMessages).values({
      tenantId,
      role: 'assistant',
      content: chatContent,
    });

    // 3. Send Telegram message (fire-and-forget)
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const telegramText = `📋 *[Kanban Trigger]*\nCard: "${title}"\nAction: ${
        action === 'created' ? 'Created' : 'Moved to In Progress'
      }${description ? `\n\nDescription: ${description.slice(0, 200)}` : ''}`;

      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramText,
          parse_mode: 'Markdown',
        }),
      }).catch((err) => {
        console.error('[kanbanTrigger] Telegram failed:', err);
      });
    }
  } catch (err) {
    console.error('[kanbanTrigger] Failed to fire trigger:', err);
    // Non-fatal — don't block the task operation
  }
}
