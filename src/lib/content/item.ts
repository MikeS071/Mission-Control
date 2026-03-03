import { and, eq } from 'drizzle-orm';

import { contentItems } from '@/db/schema';
import { db } from '@/lib/db';

export type ContentStatus = 'draft' | 'qa' | 'published' | 'deleted';

export type ContentDetailItem = {
  id: number;
  tenantId: number;
  title: string;
  slug: string;
  status: ContentStatus;
  summary: string | null;
  contentMd: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toIsoNullable(value: Date | string | null): string | null {
  if (!value) return null;
  return toIso(value);
}

export async function getContentBySlug(slug: string, tenantId: number): Promise<ContentDetailItem | null> {
  const [row] = await db
    .select({
      id: contentItems.id,
      tenantId: contentItems.tenantId,
      title: contentItems.title,
      slug: contentItems.slug,
      status: contentItems.status,
      summary: contentItems.summary,
      contentMd: contentItems.contentMd,
      publishedAt: contentItems.publishedAt,
      createdAt: contentItems.createdAt,
      updatedAt: contentItems.updatedAt,
    })
    .from(contentItems)
    .where(and(eq(contentItems.slug, slug), eq(contentItems.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    slug: row.slug,
    status: row.status as ContentStatus,
    summary: row.summary ?? null,
    contentMd: row.contentMd,
    publishedAt: toIsoNullable(row.publishedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
