import { and, desc, eq, ilike, or } from 'drizzle-orm';

import { contentItems } from '@/db/schema';
import { db } from '@/lib/db';

export type ContentStatus = 'draft' | 'qa' | 'published';

export type ContentItem = {
  id: number;
  title: string;
  slug: string;
  status: ContentStatus;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

export async function listContent(
  tenantId: number,
  opts: { status?: string; query?: string } = {},
): Promise<ContentItem[]> {
  const filters = [eq(contentItems.tenantId, tenantId)];

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
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    })
    .from(contentItems)
    .where(and(...filters))
    .orderBy(desc(contentItems.updatedAt), desc(contentItems.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status as ContentStatus,
    summary: row.summary ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }));
}
