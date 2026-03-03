import { asc, eq } from 'drizzle-orm';
import { contentSocialPosts, insights } from '@/db/schema';
import { db } from '@/lib/db';

export type SocialPlatform = 'x' | 'linkedin';
export type SocialPostStatus = 'scheduled' | 'posted' | 'failed';

export type SocialPost = {
  platform: SocialPlatform;
  text: string;
  scheduledAt: string;
  status: SocialPostStatus;
};

type ContentItem = {
  id: number;
  publishedAt: Date;
};

type SocialPostRow = {
  platform: string;
  text: string;
  scheduledAt: Date;
  status: string;
};

export class ContentItemNotFoundError extends Error {
  constructor(slug: string) {
    super(`Content item not found for slug: ${slug}`);
    this.name = 'ContentItemNotFoundError';
  }
}

export class ContentNotPublishedError extends Error {
  constructor(slug: string) {
    super(`Content item must be published before scheduling social posts: ${slug}`);
    this.name = 'ContentNotPublishedError';
  }
}

function assertPlatform(value: string): SocialPlatform {
  if (value === 'x' || value === 'linkedin') return value;
  throw new Error(`Invalid social platform: ${value}`);
}

function assertStatus(value: string): SocialPostStatus {
  if (value === 'scheduled' || value === 'posted' || value === 'failed') return value;
  throw new Error(`Invalid social post status: ${value}`);
}

function mapSocialPostRow(row: SocialPostRow): SocialPost {
  return {
    platform: assertPlatform(row.platform),
    text: row.text,
    scheduledAt: row.scheduledAt.toISOString(),
    status: assertStatus(row.status),
  };
}

function parseIsoDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date string`);
  }
  return parsed;
}

async function resolveContentItemBySlug(slug: string): Promise<ContentItem> {
  const [contentItem] = await db
    .select({
      id: insights.id,
      publishedAt: insights.publishedAt,
    })
    .from(insights)
    .where(eq(insights.slug, slug))
    .limit(1);

  if (!contentItem) {
    throw new ContentItemNotFoundError(slug);
  }

  return contentItem;
}

export async function scheduleSocialPost(
  slug: string,
  post: Omit<SocialPost, 'status'>,
): Promise<SocialPost> {
  const contentItem = await resolveContentItemBySlug(slug);

  if (contentItem.publishedAt > new Date()) {
    throw new ContentNotPublishedError(slug);
  }

  const [created] = await db
    .insert(contentSocialPosts)
    .values({
      contentItemId: contentItem.id,
      platform: post.platform,
      text: post.text,
      scheduledAt: parseIsoDate(post.scheduledAt, 'scheduledAt'),
      status: 'scheduled',
    })
    .returning({
      platform: contentSocialPosts.platform,
      text: contentSocialPosts.text,
      scheduledAt: contentSocialPosts.scheduledAt,
      status: contentSocialPosts.status,
    });

  if (!created) {
    throw new Error('Failed to schedule social post');
  }

  return mapSocialPostRow(created);
}

export async function listSocialPosts(slug: string): Promise<SocialPost[]> {
  const contentItem = await resolveContentItemBySlug(slug);

  const rows = await db
    .select({
      platform: contentSocialPosts.platform,
      text: contentSocialPosts.text,
      scheduledAt: contentSocialPosts.scheduledAt,
      status: contentSocialPosts.status,
    })
    .from(contentSocialPosts)
    .where(eq(contentSocialPosts.contentItemId, contentItem.id))
    .orderBy(asc(contentSocialPosts.scheduledAt));

  return rows.map(mapSocialPostRow);
}
