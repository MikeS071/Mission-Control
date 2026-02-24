import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatMessages, chatThreads } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

function parseThreadId(raw: string | undefined): number | null {
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await ctx.params;
  const id = parseThreadId(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawTitle = (body as any)?.title;
  const title = typeof rawTitle === 'string' ? rawTitle.trim().slice(0, 80) : '';
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const [updated] = await db
    .update(chatThreads)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(chatThreads.id, id), eq(chatThreads.tenantId, tenantId)))
    .returning({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt, createdAt: chatThreads.createdAt });

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ thread: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await ctx.params;
  const id = parseThreadId(params?.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Verify ownership.
  const [thread] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.tenantId, tenantId)))
    .limit(1);

  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Manual cascade: delete messages, then delete thread.
  await db.delete(chatMessages).where(and(eq(chatMessages.tenantId, tenantId), eq(chatMessages.threadId, id)));
  await db.delete(chatThreads).where(and(eq(chatThreads.id, id), eq(chatThreads.tenantId, tenantId)));

  return NextResponse.json({ ok: true });
}
