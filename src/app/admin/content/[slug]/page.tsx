import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { insights } from '@/db/schema';
import { listSocialPosts } from '@/lib/content/social';
import { SocialPostsSection } from './SocialPostsSection';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

function renderPanel(message: string) {
  return (
    <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-200">
      {message}
    </div>
  );
}

export default async function AdminContentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [contentItem] = await db
    .select({
      id: insights.id,
      slug: insights.slug,
      title: insights.title,
      description: insights.description,
      publishedAt: insights.publishedAt,
    })
    .from(insights)
    .where(eq(insights.slug, slug))
    .limit(1);

  if (!contentItem) {
    return (
      <section className="space-y-4">
        {renderPanel('Content item not found.')}
        <Link href="/insights" className="inline-flex rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-100 transition hover:bg-gray-900">
          Back to insights
        </Link>
      </section>
    );
  }

  const socialPosts = await listSocialPosts(slug);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Admin / Content Detail</p>
        <h1 className="text-2xl font-semibold text-white">{contentItem.title}</h1>
        <p className="text-sm text-gray-400">Slug: {contentItem.slug}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Published</p>
          <p className="mt-2 text-sm font-medium text-white">{formatDate(contentItem.publishedAt)}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:col-span-2 lg:col-span-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Description</p>
          <p className="mt-2 text-sm text-gray-200">{contentItem.description}</p>
        </div>
      </section>

      <SocialPostsSection slug={slug} initialPosts={socialPosts} />
    </section>
  );
}
