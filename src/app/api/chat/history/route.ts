/**
 * Chat History API
 * GET /api/chat/history?limit=50&beforeId=<optional>
 *
 * Returns messages for the authenticated tenant, ordered oldest-first
 * (chronological display).
 *
 * - If beforeId is omitted: returns the latest N messages.
 * - If beforeId is provided: returns the N messages immediately older than beforeId.
 *
 * Requires NextAuth session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(rawLimit ?? '50', 10) || 50, 1), 200);

  const rawBeforeId = url.searchParams.get('beforeId');
  const beforeId = rawBeforeId ? parseInt(rawBeforeId, 10) : null;
  const hasBefore = Number.isFinite(beforeId as any) && (beforeId as number) > 0;

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
      .where(
        hasBefore
          ? and(eq(chatMessages.tenantId, tenantId), lt(chatMessages.id, beforeId as number))
          : eq(chatMessages.tenantId, tenantId)
      )
      .orderBy(desc(chatMessages.id))
      .limit(limit);
  } catch (err) {
    console.error('[chat/history] DB query error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // Reverse to get oldest-first order
  const messages = rows.reverse();

  return NextResponse.json({ messages });
}
