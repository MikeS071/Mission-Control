import { and, eq } from 'drizzle-orm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { contentItems } from '@/db/schema';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function requireAdminSession() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = Number((session as { tenantId?: unknown }).tenantId);
  if (tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return { tenantId };
}

function resolveSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  return slug;
}

function resolveImagePaths(slug: string) {
  const imagesDir = path.join(process.cwd(), 'public', 'images');
  const fileName = `${slug}.png`;
  const absolutePath = path.join(imagesDir, fileName);
  const publicUrl = `/images/${fileName}`;

  return { imagesDir, absolutePath, publicUrl };
}

async function lookupContentItem(tenantId: number, slug: string) {
  const rows = await db
    .select({
      id: contentItems.id,
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    })
    .from(contentItems)
    .where(and(eq(contentItems.tenantId, tenantId), eq(contentItems.slug, slug)))
    .limit(1);

  return rows[0] ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionResult = await requireAdminSession();
  if (sessionResult instanceof Response) return sessionResult;

  const slug = resolveSlug((await params).slug);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  const item = await lookupContentItem(sessionResult.tenantId, slug);
  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'Image file is empty' }, { status: 400 });
  }

  const { imagesDir, absolutePath, publicUrl } = resolveImagePaths(slug);

  await mkdir(imagesDir, { recursive: true });
  await writeFile(absolutePath, bytes);

  const updatedRows = await db
    .update(contentItems)
    .set({
      heroImageUrl: publicUrl,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, item.id))
    .returning({
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    });

  const updated = updatedRows[0];
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update content item' }, { status: 500 });
  }

  return NextResponse.json({
    slug: updated.slug,
    heroImageUrl: updated.heroImageUrl,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionResult = await requireAdminSession();
  if (sessionResult instanceof Response) return sessionResult;

  const slug = resolveSlug((await params).slug);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const item = await lookupContentItem(sessionResult.tenantId, slug);
  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  const { absolutePath } = resolveImagePaths(slug);
  try {
    await unlink(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  const updatedRows = await db
    .update(contentItems)
    .set({
      heroImageUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, item.id))
    .returning({
      slug: contentItems.slug,
      heroImageUrl: contentItems.heroImageUrl,
    });

  const updated = updatedRows[0];
  if (!updated) {
    return NextResponse.json({ error: 'Failed to update content item' }, { status: 500 });
  }

  return NextResponse.json({
    slug: updated.slug,
    heroImageUrl: updated.heroImageUrl,
  });
}
