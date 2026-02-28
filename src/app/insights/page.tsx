import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';

const BASE_URL = 'https://archonhq.ai';
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 8;

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function estimateReadingTime(md: string): number {
  const words = md.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

export const metadata: Metadata = {
  title: 'Insights — ArchonHQ',
  description: 'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  alternates: { canonical: `${BASE_URL}/insights` },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/insights`,
    title: 'Insights — ArchonHQ',
    description: 'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Insights — ArchonHQ',
    description: 'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  },
};

export default async function InsightsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);

  const [{ count: totalCount }] = await db.select({ count: sql<number>`count(*)` }).from(insights);
  const totalPages = Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const allInsights = await db
    .select()
    .from(insights)
    .orderBy(desc(insights.publishedAt))
    .limit(PAGE_SIZE)
    .offset((currentPage - 1) * PAGE_SIZE);

  // For sidebar: recent posts (always show top 5 most recent)
  const recentPosts = await db
    .select({ slug: insights.slug, title: insights.title, publishedAt: insights.publishedAt })
    .from(insights)
    .orderBy(desc(insights.publishedAt))
    .limit(5);

  const featured = currentPage === 1 ? allInsights[0] : null;
  const gridArticles = currentPage === 1 ? allInsights.slice(1) : allInsights;

  return (
    <main
      className="relative min-h-screen px-4 py-12 text-[#f1f5f0] sm:px-6 md:px-10"
      style={{ background: '#0a1a12' }}
    >
      {/* Orb blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-52 -top-40 h-[460px] w-[460px] rounded-full blur-[130px]" style={{ background: 'rgba(255,59,111,0.04)' }} />
        <div className="absolute -bottom-48 -right-24 h-[400px] w-[400px] rounded-full blur-[100px]" style={{ background: 'rgba(45,212,122,0.05)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Back link */}
        <Link
          href="/"
          className="text-sm transition hover:text-[#2dd47a]"
          style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          ← Back to home
        </Link>

        {/* Heading */}
        <div className="mt-6">
          <p
            className="text-xs uppercase tracking-[0.4em]"
            style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
          >
            ArchonHQ
          </p>
          <h1
            className="mt-3 text-4xl font-extrabold leading-tight text-white"
            style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
          >
            Insights
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed" style={{ color: '#c4d4c8' }}>
            AI engineering insights, research notes, and product updates from the ArchonHQ team.
          </p>
        </div>

        {allInsights.length === 0 ? (
          <p className="mt-16 text-sm" style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}>
            No insights yet — check back soon.
          </p>
        ) : (
          <div className="mt-10 flex gap-10">
            {/* Main column */}
            <div className="min-w-0 flex-1">
              {/* Featured hero card (page 1 only) */}
              {featured && (
                <Link
                  href={`/insights/${featured.slug}`}
                  className="group mb-8 block overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] transition hover:border-[#2dd47a]/20 hover:bg-white/[0.05]"
                >
                  {featured.imageUrl && (
                    <img
                      src={featured.imageUrl}
                      alt={featured.title}
                      className="h-56 w-full object-cover sm:h-72"
                    />
                  )}
                  <div className="p-6">
                    <div className="flex items-center gap-3 text-xs" style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                      <span className="uppercase tracking-[0.35em]" style={{ color: '#2dd47a' }}>
                        {featured.publishedAt ? dateFormatter.format(featured.publishedAt) : 'Unscheduled'}
                      </span>
                      <span>·</span>
                      <span>{estimateReadingTime(featured.contentMd)} min read</span>
                    </div>
                    <h2
                      className="mt-3 text-2xl font-bold leading-snug text-white group-hover:text-[#2dd47a]"
                      style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
                    >
                      {featured.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: '#c4d4c8' }}>
                      {featured.description}
                    </p>
                  </div>
                </Link>
              )}

              {/* Article grid */}
              <div className="grid gap-6 sm:grid-cols-2">
                {gridArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={`/insights/${article.slug}`}
                    className="group overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] transition hover:border-[#2dd47a]/20 hover:bg-white/[0.05]"
                  >
                    {article.imageUrl && (
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        className="h-40 w-full object-cover"
                      />
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 text-[10px]" style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                        <span className="uppercase tracking-[0.3em]" style={{ color: '#2dd47a' }}>
                          {article.publishedAt ? dateFormatter.format(article.publishedAt) : 'Unscheduled'}
                        </span>
                        <span>·</span>
                        <span>{estimateReadingTime(article.contentMd)} min</span>
                      </div>
                      <h2
                        className="mt-2 text-base font-bold leading-snug text-white group-hover:text-[#2dd47a]"
                        style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
                      >
                        {article.title}
                      </h2>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed" style={{ color: '#a3b8a8' }}>
                        {article.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-2">
                  {currentPage > 1 && (
                    <Link
                      href={`/insights?page=${currentPage - 1}`}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs transition hover:border-[#2dd47a]/30 hover:text-[#2dd47a]"
                      style={{ color: '#a3b8a8' }}
                    >
                      ← Prev
                    </Link>
                  )}
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={`/insights?page=${p}`}
                      className={`rounded-lg px-3 py-1.5 text-xs transition ${
                        p === currentPage
                          ? 'bg-[#2dd47a] font-semibold text-[#0a1a12]'
                          : 'border border-white/10 hover:border-[#2dd47a]/30 hover:text-[#2dd47a]'
                      }`}
                      style={p !== currentPage ? { color: '#a3b8a8' } : undefined}
                    >
                      {p}
                    </Link>
                  ))}
                  {currentPage < totalPages && (
                    <Link
                      href={`/insights?page=${currentPage + 1}`}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs transition hover:border-[#2dd47a]/30 hover:text-[#2dd47a]"
                      style={{ color: '#a3b8a8' }}
                    >
                      Next →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-8 space-y-8">
                {/* Recent posts */}
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">Recent Posts</p>
                  <nav className="mt-3 space-y-3">
                    {recentPosts.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/insights/${post.slug}`}
                        className="block text-xs leading-relaxed transition hover:text-[#2dd47a]"
                        style={{ color: '#a3b8a8' }}
                      >
                        {post.title}
                      </Link>
                    ))}
                  </nav>
                </div>

                {/* Hot topics */}
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">Hot Topics</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['Agent Swarms', 'AI Engineering', 'DevOps'].map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-[#2dd47a]/20 px-2.5 py-1 text-[10px] font-medium"
                        style={{ color: '#2dd47a' }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Newsletter CTA */}
                <div className="rounded-xl border border-[#2dd47a]/20 bg-gradient-to-b from-[#0f2218] to-[#0a1a12] p-5">
                  <p className="text-sm font-semibold text-white">Stay in the loop</p>
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: '#a3b8a8' }}>
                    Get new articles delivered to your inbox.
                  </p>
                  <Link
                    href="/insights"
                    className="mt-3 inline-block w-full rounded-lg bg-[#2dd47a] px-3 py-2 text-center text-xs font-semibold text-[#0a1a12] transition hover:bg-[#25b866]"
                  >
                    Subscribe →
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
