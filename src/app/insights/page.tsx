import type { Metadata } from 'next';
import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Insights — Mission Control',
  description:
    'Stories, release notes, and deeper looks at how Mission Control helps teams coordinate AI agents and ship faster.',
  openGraph: {
    title: 'Insights — Mission Control',
    description:
      'Articles and updates on AI agent coordination, LLM routing, and product announcements from the ArchonHQ team.',
    type: 'website',
    url: 'https://archonhq.ai/insights',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Insights — Mission Control',
    description: 'The latest from ArchonHQ on AI routing, coordination, and product announcements.',
  },
};

type InsightSummary = {
  slug: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  sourceUrl: string | null;
};

async function getInsights(): Promise<InsightSummary[]> {
  const rows = await db
    .select({
      slug: insights.slug,
      title: insights.title,
      description: insights.description,
      publishedAt: insights.publishedAt,
      sourceUrl: insights.sourceUrl,
    })
    .from(insights)
    .orderBy(desc(insights.publishedAt));

  return rows;
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default async function InsightsPage() {
  const articles = await getInsights();

  return (
    <main
      className="relative min-h-screen px-6 py-16 text-[#f1f5f0] md:px-10"
      style={{ background: '#0a1a12' }}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-36 -top-48 h-[420px] w-[420px] rounded-full blur-[120px]"
          style={{ background: 'rgba(255,59,111,0.04)' }}
        />
        <div
          className="absolute -bottom-48 -right-12 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: 'rgba(45,212,122,0.05)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p
              className="mb-2 font-mono text-xs uppercase tracking-[0.4em]"
              style={{ color: '#ff3b6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
            >
              — archon insights
            </p>
            <h1
              className="text-3xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
            >
              Mission Control Insights
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: '#a3b8a8' }}>
              Deep dives on AI agent coordination, routing patterns, new product releases, and the signals we&apos;re
              seeing across the OpenClaw network.
            </p>
          </div>

          <Link
            href="/"
            className="text-sm transition hover:text-[#ff6b8a]"
            style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
          >
            ← Back to home
          </Link>
        </div>

        {articles.length === 0 ? (
          <div
            className="mt-12 rounded-2xl p-8 text-center"
            style={{ border: '1px solid rgba(45,212,122,0.15)', background: '#0f2418' }}
          >
            <p
              className="font-mono text-xs uppercase tracking-[0.5em]"
              style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
            >
              coming soon
            </p>
            <p className="mt-3 text-lg font-semibold" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
              We&apos;re drafting the first insights now.
            </p>
            <p className="mt-2 text-sm" style={{ color: '#a3b8a8' }}>
              Subscribe to the waitlist or check back shortly for the latest drop.
            </p>
          </div>
        ) : (
          <section className="mt-12 grid gap-6 md:grid-cols-2">
            {articles.map((article) => (
              <InsightCard key={article.slug} article={article} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function InsightCard({ article }: { article: InsightSummary }) {
  const publishedLabel = article.publishedAt ? dateFormatter.format(article.publishedAt) : 'Unscheduled';

  return (
    <article
      className="flex h-full flex-col rounded-2xl p-6"
      style={{ border: '1px solid rgba(45,212,122,0.15)', background: '#0f2418' }}
    >
      <p
        className="text-xs uppercase tracking-[0.4em]"
        style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
      >
        {publishedLabel}
      </p>
      <h2
        className="mt-4 text-2xl font-semibold leading-tight"
        style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
      >
        {article.title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: '#c4d4c8' }}>
        {article.description}
      </p>

      <div className="mt-6 flex flex-1 flex-col justify-end">
        <div className="flex items-center gap-4">
          <Link
            href={`/insights/${article.slug}`}
            className="text-sm font-semibold transition hover:text-[#ff6b8a]"
            style={{ color: '#f1f5f0' }}
          >
            Read article →
          </Link>
          {article.sourceUrl ? (
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs uppercase tracking-[0.4em]"
              style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
            >
              SOURCE
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
