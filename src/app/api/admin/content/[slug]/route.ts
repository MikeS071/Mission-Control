import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import {
  getContentBySlug,
  softDeleteContentBySlug,
  type ContentPatch,
  updateContentBySlug,
} from '@/lib/content';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    summary: z.string().max(4000).nullable().optional(),
    contentMd: z.string().max(200000).optional(),
    status: z.enum(['draft', 'qa', 'published']).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

async function requireAdminSession() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = Number((session as { tenantId?: unknown }).tenantId);
  if (tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return { session, tenantId };
}

function resolveSlug(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!SLUG_RE.test(trimmed)) return null;
  return trimmed;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionResult = await requireAdminSession();
  if (sessionResult instanceof Response) return sessionResult;

  const rawSlug = (await params).slug;
  const slug = resolveSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const item = await getContentBySlug(sessionResult.tenantId, slug);
  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionResult = await requireAdminSession();
  if (sessionResult instanceof Response) return sessionResult;

  const rawSlug = (await params).slug;
  const slug = resolveSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const payload: ContentPatch = {
    title: parsed.data.title,
    summary: parsed.data.summary,
    contentMd: parsed.data.contentMd,
    status: parsed.data.status,
  };

  const updated = await updateContentBySlug(sessionResult.tenantId, slug, payload);
  if (!updated) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const sessionResult = await requireAdminSession();
  if (sessionResult instanceof Response) return sessionResult;

  const rawSlug = (await params).slug;
  const slug = resolveSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const deleted = await softDeleteContentBySlug(sessionResult.tenantId, slug);
  if (!deleted) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
