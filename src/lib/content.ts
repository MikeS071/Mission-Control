import { and, desc, eq, ilike, ne, or } from 'drizzle-orm';

import { contentItems } from '@/db/schema';
import { db } from '@/lib/db';

export type ContentStatus = 'draft' | 'qa' | 'published' | 'deleted';

export type ContentItem = {
  id: number;
  title: string;
  slug: string;
  status: ContentStatus;
  summary: string | null;
  contentMd: string;
  heroImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentPatch = {
  title?: string;
  summary?: string | null;
  contentMd?: string;
  status?: ContentStatus;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function toItem(row: {
  id: number;
  title: string;
  slug: string;
  status: string;
  summary: string | null;
  contentMd: string;
  heroImageUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ContentItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status as ContentStatus,
    summary: row.summary ?? null,
    contentMd: row.contentMd,
    heroImageUrl: row.heroImageUrl ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listContent(
  tenantId: number,
  opts: { status?: string; query?: string; includeDeleted?: boolean } = {},
): Promise<ContentItem[]> {
  const filters = [eq(contentItems.tenantId, tenantId)];

  if (!opts.includeDeleted) {
    filters.push(ne(contentItems.status, 'deleted'));
  }

  if (opts.status) {
    filters.push(eq(contentItems.status, opts.status));
  }

  const trimmedQuery = opts.query?.trim();
  if (trimmedQuery) {
    const likePattern = `%${trimmedQuery}%`;
    filters.push(or(ilike(contentItems.title, likePattern), ilike(contentItems.slug, likePattern))!);
  }

  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      slug: contentItems.slug,
      status: contentItems.status,
      summary: contentItems.summary,
      contentMd: contentItems.contentMd,
      heroImageUrl: contentItems.heroImageUrl,
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    })
    .from(contentItems)
    .where(and(...filters))
    .orderBy(desc(contentItems.updatedAt), desc(contentItems.id));

  return rows.map((row) => toItem(row));
}

export async function getContentBySlug(tenantId: number, slug: string): Promise<ContentItem | null> {
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      slug: contentItems.slug,
      status: contentItems.status,
      summary: contentItems.summary,
      contentMd: contentItems.contentMd,
      heroImageUrl: contentItems.heroImageUrl,
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    })
    .from(contentItems)
    .where(and(eq(contentItems.tenantId, tenantId), eq(contentItems.slug, slug), ne(contentItems.status, 'deleted')))
    .limit(1);

  const row = rows[0];
  return row ? toItem(row) : null;
}

export async function updateContentBySlug(
  tenantId: number,
  slug: string,
  patch: ContentPatch,
): Promise<ContentItem | null> {
  const values: {
    title?: string;
    summary?: string | null;
    contentMd?: string;
    status?: ContentStatus;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (patch.title !== undefined) values.title = patch.title;
  if (patch.summary !== undefined) values.summary = patch.summary;
  if (patch.contentMd !== undefined) values.contentMd = patch.contentMd;
  if (patch.status !== undefined) values.status = patch.status;

  const rows = await db
    .update(contentItems)
    .set(values)
    .where(and(eq(contentItems.tenantId, tenantId), eq(contentItems.slug, slug), ne(contentItems.status, 'deleted')))
    .returning({
      id: contentItems.id,
      title: contentItems.title,
      slug: contentItems.slug,
      status: contentItems.status,
      summary: contentItems.summary,
      contentMd: contentItems.contentMd,
      heroImageUrl: contentItems.heroImageUrl,
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    });

  const row = rows[0];
  return row ? toItem(row) : null;
}

export async function softDeleteContentBySlug(tenantId: number, slug: string): Promise<boolean> {
  const rows = await db
    .update(contentItems)
    .set({
      status: 'deleted',
      updatedAt: new Date(),
    })
    .where(and(eq(contentItems.tenantId, tenantId), eq(contentItems.slug, slug), ne(contentItems.status, 'deleted')))
    .returning({ id: contentItems.id });

  return rows.length > 0;
}
