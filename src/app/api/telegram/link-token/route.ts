import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, telegramLinkTokens } from '@/db/schema';
import { auth } from '@/lib/auth';
import { resolveTenantId } from '@/lib/tenant';
import { isMcTelegramBridgeEnabled } from '@/lib/telegram-ingress';

export async function POST(req: NextRequest) {
  if (!isMcTelegramBridgeEnabled()) {
    return NextResponse.json({ error: 'MC Telegram bridge is disabled (MC_TELEGRAM_INGRESS_MODE=openclaw).' }, { status: 409 });
  }

  const tenantId = await resolveTenantId(req);
  const session = await auth();
  const email = session?.user?.email;

  if (!tenantId || !email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user?.id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60_000);

  await db.insert(telegramLinkTokens).values({
    token,
    tenantId,
    userId: user.id,
    expiresAt,
  });

  const bot = process.env.TELEGRAM_BOT_USERNAME;
  const deepLinkUrl = bot ? `https://t.me/${bot}?start=${token}` : null;

  return NextResponse.json({ token, deepLinkUrl, expiresAt: expiresAt.toISOString() });
}
