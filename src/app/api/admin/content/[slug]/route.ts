import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { contentItems } from '@/db/schema';
import { auth } from '@/lib/auth';

const PATCH_STATUSES = new Set(['draft', 'qa', 'published']);

type AdminSession = {
  user?: {
    email?: string | null;
  };
  tenantId?: unknown;
} | null;

async function requireAdminSession(): Promise<
  | { ok: true; tenantId: number }
  | { ok: false; response: NextResponse<{ error: string }> }
> {
  const session = (await auth()) as AdminSession;

  if (!session?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const tenantId = Number(session.tenantId);
  if (tenantId !== 1) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { ok: true, tenantId };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;

  const { slug } = await context.params;

  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Partial<typeof contentItems.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
    }
    updates.title = body.title.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'summary')) {
    if (typeof body.summary !== 'string') {
      return NextResponse.json({ error: 'Invalid summary' }, { status: 400 });
    }
    updates.summary = body.summary;
  }

  const contentMd = Object.prototype.hasOwnProperty.call(body, 'content_md')
    ? body.content_md
    : body.contentMd;
  if (contentMd !== undefined) {
    if (typeof contentMd !== 'string') {
      return NextResponse.json({ error: 'Invalid content_md' }, { status: 400 });
    }
    updates.contentMd = contentMd;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (typeof body.status !== 'string' || !PATCH_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }

  const updatableKeys = Object.keys(updates).filter((key) => key !== 'updatedAt');
  if (updatableKeys.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { slug } = await context.params;

  const [updated] = await db
    .update(contentItems)
    .set(updates)
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;

  const { slug } = await context.params;

  const [deleted] = await db
    .update(contentItems)
    .set({
      status: 'deleted',
      updatedAt: new Date(),
    })
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: deleted });
}
