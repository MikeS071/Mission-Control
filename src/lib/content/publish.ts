import { and, eq } from 'drizzle-orm';

import { contentItems } from '@/db/schema';
import { db } from '@/lib/db';

type ContentRow = {
  id: number;
  tenantId: number;
  title: string;
  summary: string | null;
  contentMd: string;
  status: string;
};

export class ContentPublishError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ContentPublishError';
    this.status = status;
  }
}

function assertFilled(value: string | null | undefined, fieldLabel: string) {
  if (!value || value.trim().length === 0) {
    throw new ContentPublishError(`${fieldLabel} is required before publishing`);
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function getContentForPublish(slug: string, tenantId: number): Promise<ContentRow | null> {
  const [row] = await db
    .select({
      id: contentItems.id,
      tenantId: contentItems.tenantId,
      title: contentItems.title,
      summary: contentItems.summary,
      contentMd: contentItems.contentMd,
      status: contentItems.status,
    })
    .from(contentItems)
    .where(and(eq(contentItems.slug, slug), eq(contentItems.tenantId, tenantId)))
    .limit(1);

  return row ?? null;
}

export async function publishContent(
  slug: string,
  tenantId: number,
): Promise<{ success: boolean; publishedAt: string }> {
  const content = await getContentForPublish(slug, tenantId);

  if (!content) {
    throw new ContentPublishError('Content item not found', 404);
  }

  assertFilled(content.title, 'title');
  assertFilled(content.summary, 'summary');
  assertFilled(content.contentMd, 'content_md');

  if (content.status !== 'draft' && content.status !== 'qa') {
    throw new ContentPublishError('Only draft or qa content can be published');
  }

  const now = new Date();
  const [updated] = await db
    .update(contentItems)
    .set({
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(contentItems.id, content.id), eq(contentItems.tenantId, tenantId)))
    .returning({ publishedAt: contentItems.publishedAt });

  if (!updated?.publishedAt) {
    throw new ContentPublishError('Failed to publish content', 500);
  }

  return {
    success: true,
    publishedAt: toIso(updated.publishedAt),
  };
}
