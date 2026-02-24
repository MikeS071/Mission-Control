import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { telegramUpdates } from '@/db/schema';
import { auth } from '@/lib/auth';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  const session = await auth();

  if (!tenantId || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get('limit') ?? '20')));

  const rows = await db
    .select({
      updateId: telegramUpdates.updateId,
      status: telegramUpdates.status,
      error: telegramUpdates.error,
      receivedAt: telegramUpdates.receivedAt,
      processedAt: telegramUpdates.processedAt,
      telegramUserId: telegramUpdates.telegramUserId,
    })
    .from(telegramUpdates)
    .where(eq(telegramUpdates.tenantId, tenantId))
    .orderBy(desc(telegramUpdates.receivedAt))
    .limit(limit);

  return NextResponse.json({ updates: rows });
}
