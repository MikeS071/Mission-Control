import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { insights } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';

const BASE_URL = 'https://archonhq.ai';
export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const getInsight = cache(async (slug: string) => {
  const [record] = await db.select().from(insights).where(eq(insights.slug, slug)).limit(1);
  return record ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getInsight(slug);

  if (!article) {
    return {
      title: 'Insight not found',
      description: 'The requested insight could not be found.',
    };
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
      ...(article.imageUrl ? { images: [{ url: `${BASE_URL}${article.imageUrl}`, width: 1792, height: 1024, alt: article.title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      ...(article.imageUrl ? { images: [`${BASE_URL}${article.imageUrl}`] } : {}),
    },
  };
}

export default async function InsightArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getInsight(slug);

  if (!article) {
    notFound();
  }

  const contentHtml = renderMarkdown(article.contentMd);
  const publishedLabel = article.publishedAt ? dateFormatter.format(article.publishedAt) : 'Unscheduled';

  return (
    <main
      className="relative min-h-screen px-6 py-16 text-[#f1f5f0] md:px-10"
      style={{ background: '#0a1a12' }}
    >
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
        <Link
          href="/insights"
          className="text-sm transition hover:text-[#ff6b8a]"
          style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          ← Back to insights
        </Link>

        <p
          className="mt-6 text-xs uppercase tracking-[0.4em]"
          style={{ color: '#2dd47a', fontFamily: 'var(--font-jetbrains, monospace)' }}
        >
          {publishedLabel}
        </p>

        <h1
          className="mt-4 text-4xl font-extrabold leading-tight text-white"
          style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
        >
          {article.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed" style={{ color: '#c4d4c8' }}>
          {article.description}
        </p>

        {article.sourceUrl ? (
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center text-sm font-semibold transition hover:text-[#ff6b8a]"
            style={{ color: '#f1f5f0' }}
          >
            View original source →
          </a>
        ) : null}

        <article
          className="insight-body mt-10 text-base leading-7 text-[#d4e6d8] [&_a]:text-[#2dd47a] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#2dd47a]/50 [&_blockquote]:pl-4 [&_blockquote]:text-[#f1f5f0] [&_code]:rounded [&_code]:bg-[#142e1f] [&_code]:px-1.5 [&_code]:py-0.5 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_hr]:my-8 [&_li]:my-2 [&_li]:leading-7 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-4 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#08150f] [&_pre]:p-5 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5"
          style={{ fontFamily: 'var(--font-inter, sans-serif)' }}
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </div>
    </main>
  );
}
