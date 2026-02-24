import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatThreads } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt, createdAt: chatThreads.createdAt })
    .from(chatThreads)
    .where(eq(chatThreads.tenantId, tenantId))
    .orderBy(desc(chatThreads.updatedAt));

  return NextResponse.json({ threads: rows });
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rawTitle = (body as any)?.title;
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 80) : 'New thread';

  const [ins] = await db
    .insert(chatThreads)
    .values({ tenantId, title })
    .returning({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt, createdAt: chatThreads.createdAt });

  return NextResponse.json({ thread: ins });
}
