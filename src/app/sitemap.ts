import type { MetadataRoute } from 'next';
import { desc } from 'drizzle-orm';

import { source } from '@/lib/source';
import { db } from '@/lib/db';
import { insights } from '@/db/schema';

// Force dynamic so the sitemap is generated at request time (not build time).
// Required because it queries Postgres — DB is not available during Docker build.
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://archonhq.ai';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const nowIso = now.toISOString();

  const [docPages, insightEntries] = await Promise.all([
    Promise.resolve(
      source.getPages().map((page) => ({
        url: `${BASE_URL}/docs/${page.slugs.join('/')}`,
        lastModified: nowIso,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
    ),
    db
      .select({ slug: insights.slug, publishedAt: insights.publishedAt })
      .from(insights)
      .orderBy(desc(insights.publishedAt)),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: nowIso,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/roadmap`,
      lastModified: nowIso,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: nowIso,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/insights`,
      lastModified: nowIso,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
  ];

  const insightPages: MetadataRoute.Sitemap = insightEntries.map((insightRow) => ({
    url: `${BASE_URL}/insights/${insightRow.slug}`,
    lastModified: (insightRow.publishedAt ?? now).toISOString(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...docPages, ...insightPages];
}
