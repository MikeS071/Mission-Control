const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function telegramSendMessage(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // best-effort
  }
}

export async function telegramSendChatAction(chatId: number | string, action: 'typing'): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // best-effort
  }
}
