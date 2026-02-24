import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { telegramLinks, users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { resolveTenantId } from '@/lib/tenant';

export async function POST(req: NextRequest) {
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

  await db
    .update(telegramLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(telegramLinks.tenantId, tenantId), eq(telegramLinks.userId, user.id), isNull(telegramLinks.revokedAt)));

  return NextResponse.json({ ok: true });
}
