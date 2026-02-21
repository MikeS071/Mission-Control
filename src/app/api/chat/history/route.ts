/**
 * Chat History API
 * GET /api/chat/history?limit=50
 *
 * Returns the last N messages for the authenticated tenant,
 * ordered oldest-first (for display in chronological order).
 *
 * Requires NextAuth session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant associated with session' }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(rawLimit ?? '50', 10) || 50, 1), 200);

  let rows: Array<{ id: number; role: string; content: string; createdAt: Date }>;
  try {
    rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.tenantId, tenantId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
  } catch (err) {
    console.error('[chat/history] DB query error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Reverse to get oldest-first order
  const messages = rows.reverse();

  return NextResponse.json({ messages });
}
