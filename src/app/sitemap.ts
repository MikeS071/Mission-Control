import type { MetadataRoute } from 'next';
import { desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://archonhq.ai';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const nowIso = now.toISOString();

  let insightPages: MetadataRoute.Sitemap = [];
  try {
    const insightEntries = await db
      .select({ slug: insights.slug, publishedAt: insights.publishedAt })
      .from(insights)
      .orderBy(desc(insights.publishedAt));

    insightPages = insightEntries.map((row) => ({
      url: `${BASE_URL}/insights/${row.slug}`,
      lastModified: (row.publishedAt ?? now).toISOString(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    // DB unavailable during build — skip insights
  }

  return [
    { url: BASE_URL, lastModified: nowIso, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/roadmap`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/docs`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/insights`, lastModified: nowIso, changeFrequency: 'weekly', priority: 0.75 },
    ...insightPages,
  ];
}
