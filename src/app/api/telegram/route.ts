import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  await sendTelegramMessage(body.text);
  return NextResponse.json({ ok: true });
}
