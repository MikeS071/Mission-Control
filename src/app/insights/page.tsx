import type { Metadata } from 'next';
import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';

const BASE_URL = 'https://archonhq.ai';
export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export const metadata: Metadata = {
  title: 'Insights — ArchonHQ',
  description:
    'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  alternates: { canonical: `${BASE_URL}/insights` },
  openGraph: {
    type: 'website',
    url: `${BASE_URL}/insights`,
    title: 'Insights — ArchonHQ',
    description:
      'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Insights — ArchonHQ',
    description:
      'AI engineering insights, research notes, and product updates from the ArchonHQ team.',
  },
};

export default async function InsightsIndexPage() {
  const allInsights = await db
    .select()
    .from(insights)
    .orderBy(desc(insights.publishedAt));

  return (
    <main
      className="relative min-h-screen px-6 py-16 text-[#f1f5f0] md:px-10"
      style={{ background: '#0a1a12' }}
    >
      {/* Orb blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-52 -top-40 h-[460px] w-[460px] rounded-full blur-[130px]"
          style={{ background: 'rgba(255,59,111,0.04)' }}
        />
        <div
          className="absolute -bottom-48 -right-24 h-[400px] w-[400px] rounded-full blur-[100px]"
          style={{ background: 'rgba(45,212,122,0.05)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          href="/"
          className="text-sm transition hover:text-[#ff6b8a]"
          style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          ← Back to home
        </Link>

        {/* Heading */}
        <p
          className="mt-6 text-xs uppercase tracking-[0.4em]"
          style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          ArchonHQ
        </p>
        <h1
          className="mt-4 text-4xl font-extrabold leading-tight text-white"
          style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
        >
          Insights
        </h1>
        <p className="mt-4 text-base leading-relaxed" style={{ color: '#c4d4c8' }}>
          AI engineering insights, research notes, and product updates from the ArchonHQ team.
        </p>

        {/* Articles list or empty state */}
        {allInsights.length === 0 ? (
          <p
            className="mt-16 text-sm"
            style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
          >
            No insights yet — check back soon.
          </p>
        ) : (
          <ul className="mt-12 space-y-8">
            {allInsights.map((article) => {
              const publishedLabel = article.publishedAt
                ? dateFormatter.format(article.publishedAt)
                : 'Unscheduled';

              return (
                <li
                  key={article.id}
                  className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 transition hover:border-[#2dd47a]/20 hover:bg-white/[0.05]"
                >
                  <p
                    className="text-xs uppercase tracking-[0.35em]"
                    style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
                  >
                    {publishedLabel}
                  </p>
                  <h2
                    className="mt-2 text-xl font-bold leading-snug text-white"
                    style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
                  >
                    <Link
                      href={`/insights/${article.slug}`}
                      className="transition hover:text-[#2dd47a]"
                    >
                      {article.title}
                    </Link>
                  </h2>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: '#c4d4c8', fontFamily: 'var(--font-inter, sans-serif)' }}
                  >
                    {article.description}
                  </p>
                  <Link
                    href={`/insights/${article.slug}`}
                    className="mt-4 inline-flex items-center text-sm font-semibold transition hover:text-[#ff6b8a]"
                    style={{ color: '#f1f5f0', fontFamily: 'var(--font-jetbrains, monospace)' }}
                  >
                    Read more →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
