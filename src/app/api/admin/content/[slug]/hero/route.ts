import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { contentItems } from '@/db/schema';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

type AdminSession = {
  user?: {
    email?: string | null;
  };
  tenantId?: unknown;
} | null;

type RouteContext = { params: Promise<{ slug: string }> };

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

function imagePathFromUrl(url: string): string | null {
  if (!url.startsWith('/images/')) return null;
  return path.join(process.cwd(), 'public', url.replace(/^\//, ''));
}

export async function POST(req: NextRequest, context: RouteContext) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;

  const { slug } = await context.params;

  const formData = await req.formData();
  const uploaded = formData.get('file');
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
  }

  const [item] = await db
    .select({
      id: contentItems.id,
      slug: contentItems.slug,
      tenantId: contentItems.tenantId,
    })
    .from(contentItems)
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  const inputExt = path.extname(uploaded.name).toLowerCase();
  const ext = inputExt || '.png';
  const fileName = `${slug}${ext}`;
  const heroImageUrl = `/images/${fileName}`;
  const imagesDir = path.join(process.cwd(), 'public', 'images');

  await mkdir(imagesDir, { recursive: true });
  const buffer = Buffer.from(await uploaded.arrayBuffer());
  await writeFile(path.join(imagesDir, fileName), buffer);

  const [updated] = await db
    .update(contentItems)
    .set({
      heroImageUrl,
      updatedAt: new Date(),
    })
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .returning({
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    });

  if (!updated) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;

  const { slug } = await context.params;

  const [item] = await db
    .select({
      id: contentItems.id,
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    })
    .from(contentItems)
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  const [updated] = await db
    .update(contentItems)
    .set({
      heroImageUrl: null,
      updatedAt: new Date(),
    })
    .where(and(eq(contentItems.tenantId, admin.tenantId), eq(contentItems.slug, slug)))
    .returning({
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    });

  if (!updated) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  if (item.heroImageUrl) {
    const filePath = imagePathFromUrl(item.heroImageUrl);
    if (filePath) {
      await unlink(filePath).catch((error: unknown) => {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ENOENT') {
          return;
        }
        throw error;
      });
    }
  }

  return NextResponse.json(updated);
}
