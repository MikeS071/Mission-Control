import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ContentPublishButton } from '@/components/admin/ContentPublishButton';
import { getAdminRedirectPath } from '@/lib/admin-auth';
import { auth } from '@/lib/auth';
import { getContentBySlug } from '@/lib/content/item';

type Status = 'draft' | 'qa' | 'published' | 'deleted';

function statusClass(status: Status): string {
  if (status === 'published') return 'border-emerald-700/70 bg-emerald-900/30 text-emerald-200';
  if (status === 'qa') return 'border-amber-700/70 bg-amber-900/30 text-amber-200';
  if (status === 'deleted') return 'border-red-700/70 bg-red-900/30 text-red-200';
  return 'border-slate-700/70 bg-slate-800/50 text-slate-200';
}

function canPublish(status: Status): boolean {
  return status === 'draft' || status === 'qa';
}

export default async function AdminContentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const redirectPath = getAdminRedirectPath(session);

  if (redirectPath) {
    redirect(redirectPath);
  }

  const tenantId = Number((session as { tenantId?: unknown }).tenantId);
  const { slug } = await params;
  const content = await getContentBySlug(slug, tenantId);

  if (!content || content.status === 'deleted') {
    notFound();
  }

  return (
    <section className="space-y-6 text-gray-100">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Admin / Content Detail</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{content.title}</h1>
          <p className="mt-2 font-mono text-xs text-gray-400">/{content.slug}</p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs uppercase tracking-wide ${statusClass(content.status)}`}>
            {content.status}
          </span>
          {canPublish(content.status) ? <ContentPublishButton slug={content.slug} /> : null}
        </div>
      </header>

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">Summary</p>
        <p className="mt-2 text-sm text-gray-200">{content.summary?.trim() || 'No summary set.'}</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">Content</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm text-gray-200">{content.contentMd || ''}</pre>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Created: {new Date(content.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(content.updatedAt).toLocaleString()}</span>
      </div>

      <Link
        href="/admin/content"
        className="inline-flex rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-800"
      >
        Back to content
      </Link>
    </section>
  );
}
