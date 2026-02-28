import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { eq, desc, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';
import NewsletterSignup from './newsletter-signup';

const BASE_URL = 'https://archonhq.ai';
const absUrl = (url: string) => (url.startsWith('http') ? url : `${BASE_URL}${url}`);
export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function estimateReadingTime(md: string): number {
  const words = md.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

/** Extract h2/h3 headings from markdown for table of contents */
function extractHeadings(md: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  for (const line of md.split('\n')) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const text = match[2].replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      headings.push({ level: match[1].length, text, id });
    }
  }
  return headings;
}

const getInsight = cache(async (slug: string) => {
  const [record] = await db.select().from(insights).where(eq(insights.slug, slug)).limit(1);
  return record ?? null;
});

const getRelatedInsights = cache(async (currentSlug: string) => {
  return db
    .select({ slug: insights.slug, title: insights.title, imageUrl: insights.imageUrl })
    .from(insights)
    .where(ne(insights.slug, currentSlug))
    .orderBy(desc(insights.publishedAt))
    .limit(3);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getInsight(slug);

  if (!article) {
    return { title: 'Insight not found', description: 'The requested insight could not be found.' };
  }

  return {
    title: `${article.title} — Mission Control Insights`,
    description: article.description,
    alternates: { canonical: `${BASE_URL}/insights/${article.slug}` },
    openGraph: {
      type: 'article',
      url: `${BASE_URL}/insights/${article.slug}`,
      title: article.title,
      description: article.description,
      publishedTime: article.publishedAt?.toISOString(),
      ...(article.imageUrl ? { images: [{ url: absUrl(article.imageUrl), width: 1792, height: 1024, alt: article.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      ...(article.imageUrl ? { images: [absUrl(article.imageUrl)] } : {}),
    },
  };
}

export default async function InsightArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getInsight(slug);
  if (!article) notFound();

  const contentHtml = renderMarkdown(article.contentMd);
  const publishedLabel = article.publishedAt ? dateFormatter.format(article.publishedAt) : 'Unscheduled';
  const readingTime = estimateReadingTime(article.contentMd);
  const headings = extractHeadings(article.contentMd);
  const related = await getRelatedInsights(slug);

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
          href="/insights"
          className="text-sm transition hover:text-[#2dd47a]"
          style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          ← Back to insights
        </Link>

        {/* Hero image - full width */}
        {article.imageUrl && (
          <div className="mt-6 overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(45,212,122,0.12)' }}>
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full object-cover"
              style={{ maxHeight: 420 }}
            />
          </div>
        )}

        {/* Two-column layout */}
        <div className="mt-8 flex gap-10">
          {/* Main content column */}
          <div className="min-w-0 flex-1">
            {/* Meta line */}
            <div className="flex items-center gap-3 text-xs" style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}>
              <span className="uppercase tracking-[0.35em]" style={{ color: '#2dd47a' }}>{publishedLabel}</span>
              <span>·</span>
              <span>{readingTime} min read</span>
            </div>

            <h1
              className="mt-4 text-3xl font-extrabold leading-tight text-white sm:text-4xl"
              style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
            >
              {article.title}
            </h1>

            <p className="mt-3 text-base leading-relaxed" style={{ color: '#c4d4c8' }}>
              {article.description}
            </p>

            {article.sourceUrl ? (
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center text-sm font-semibold transition hover:text-[#ff6b8a]"
                style={{ color: '#f1f5f0' }}
              >
                View original source →
              </a>
            ) : null}

            {/* Article body */}
            <article
              className="insight-body mt-10 text-base leading-7 text-[#d4e6d8] [&_a]:text-[#2dd47a] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#2dd47a]/50 [&_blockquote]:pl-4 [&_blockquote]:text-[#f1f5f0] [&_code]:rounded [&_code]:bg-[#142e1f] [&_code]:px-1.5 [&_code]:py-0.5 [&_h2]:mt-10 [&_h2]:scroll-mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:scroll-mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_hr]:my-8 [&_li]:my-2 [&_li]:leading-7 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-4 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#08150f] [&_pre]:p-5 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border [&_th]:border-[#2dd47a]/20 [&_th]:bg-[#0a1a12] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-white [&_th]:font-semibold [&_td]:border [&_td]:border-[#2dd47a]/10 [&_td]:px-3 [&_td]:py-2 [&_tr]:even:bg-[#0f2218]"
              style={{ fontFamily: 'var(--font-inter, sans-serif)' }}
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            {/* Related articles */}
            {related.length > 0 && (
              <div className="mt-16 border-t border-white/10 pt-10">
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                  More from ArchonHQ
                </h3>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {related.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/insights/${r.slug}`}
                      className="group overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] transition hover:border-[#2dd47a]/20 hover:bg-white/[0.05]"
                    >
                      {r.imageUrl && (
                        <img src={r.imageUrl} alt={r.title} className="h-32 w-full object-cover" />
                      )}
                      <p className="p-3 text-sm font-medium leading-snug text-white group-hover:text-[#2dd47a]" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                        {r.title}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar - hidden on mobile */}
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-8 space-y-8">
              {/* Author card */}
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#2dd47a] to-[#1a8a4a] text-sm font-bold text-white">
                    MS
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Mike Szalinski</p>
                    <p className="text-xs" style={{ color: '#6a7f6f' }}>Founder, ArchonHQ</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: '#a3b8a8' }}>
                  Building AI-powered tools for engineering teams. Writing about what actually works.
                </p>
                <div className="mt-3 flex gap-2">
                  <a href="https://x.com/teaser380" target="_blank" rel="noopener noreferrer" className="text-xs transition hover:text-[#2dd47a]" style={{ color: '#6a7f6f' }}>𝕏 Twitter</a>
                  <span style={{ color: '#333' }}>·</span>
                  <a href="https://linkedin.com/in/michalszalinski" target="_blank" rel="noopener noreferrer" className="text-xs transition hover:text-[#2dd47a]" style={{ color: '#6a7f6f' }}>LinkedIn</a>
                </div>
              </div>

              {/* Table of contents */}
              {headings.length > 2 && (
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">In this article</p>
                  <nav className="mt-3 space-y-1.5">
                    {headings.map((h) => (
                      <a
                        key={h.id}
                        href={`#${h.id}`}
                        className={`block text-xs leading-relaxed transition hover:text-[#2dd47a] ${h.level === 3 ? 'pl-3' : ''}`}
                        style={{ color: '#a3b8a8' }}
                      >
                        {h.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              {/* Newsletter signup */}
              <NewsletterSignup />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
