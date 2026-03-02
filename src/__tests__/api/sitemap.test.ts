import type { MetadataRoute } from 'next';

jest.mock('@/lib/source', () => ({
  source: {
    getPages: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/db/schema', () => ({
  insights: {
    slug: 'slug',
    publishedAt: 'publishedAt',
  },
}));

jest.mock('drizzle-orm', () => ({
  desc: jest.fn((value) => value),
}));

import sitemap from '@/app/sitemap';
import { source } from '@/lib/source';
import { db } from '@/lib/db';

type DocPage = { slugs: string[] };
type InsightRow = { slug: string; publishedAt: Date | null };
type SelectBuilder = {
  from: jest.Mock;
  orderBy: jest.Mock;
};

const mockedGetPages = source.getPages as jest.MockedFunction<typeof source.getPages>;
const mockedSelect = db.select as jest.Mock;

function setInsightQuery(rows: InsightRow[] | Promise<InsightRow[]>): SelectBuilder {
  const orderBy = jest.fn().mockReturnValue(rows);
  const from = jest.fn().mockReturnValue({ orderBy });
  mockedSelect.mockReturnValue({ from });
  return { from, orderBy };
}

function findEntry(entries: MetadataRoute.Sitemap, url: string) {
  return entries.find((entry) => entry.url === url);
}

describe('sitemap route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns static, docs, and insight URLs when dependencies succeed', async () => {
    mockedGetPages.mockReturnValue(
      [{ slugs: ['getting-started'] }] as unknown as ReturnType<typeof source.getPages>,
    );
    setInsightQuery([{ slug: 'launch', publishedAt: new Date('2026-01-02T00:00:00.000Z') }]);

    const entries = await sitemap();

    expect(findEntry(entries, 'https://archonhq.ai')).toBeDefined();
    expect(findEntry(entries, 'https://archonhq.ai/docs/getting-started')).toBeDefined();
    expect(findEntry(entries, 'https://archonhq.ai/insights/launch')).toBeDefined();
  });

  it('still returns static and insight URLs when docs source throws', async () => {
    mockedGetPages.mockImplementation(() => {
      throw new TypeError('t.files is not iterable');
    });
    setInsightQuery([{ slug: 'launch', publishedAt: new Date('2026-01-02T00:00:00.000Z') }]);

    const entries = await sitemap();

    expect(findEntry(entries, 'https://archonhq.ai')).toBeDefined();
    expect(findEntry(entries, 'https://archonhq.ai/insights/launch')).toBeDefined();
    expect(entries.some((entry) => entry.url.includes('/docs/'))).toBe(false);
  });

  it('still returns static and docs URLs when insight query fails', async () => {
    mockedGetPages.mockReturnValue(
      [{ slugs: ['getting-started'] }] as unknown as ReturnType<typeof source.getPages>,
    );
    setInsightQuery(Promise.reject(new Error('db down')));

    const entries = await sitemap();

    expect(findEntry(entries, 'https://archonhq.ai')).toBeDefined();
    expect(findEntry(entries, 'https://archonhq.ai/docs/getting-started')).toBeDefined();
    expect(entries.some((entry) => entry.url.includes('/insights/'))).toBe(false);
  });
});
