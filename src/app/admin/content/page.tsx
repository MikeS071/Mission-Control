import Link from 'next/link';

import { auth } from '@/lib/auth';
import { listContent, type ContentStatus } from '@/lib/content';

type PageSearchParams = {
  status?: string | string[];
  q?: string | string[];
};

const statuses = ['all', 'draft', 'qa', 'published'] as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}

function statusClass(status: ContentStatus): string {
  if (status === 'published') return 'border-emerald-700/70 bg-emerald-900/30 text-emerald-200';
  if (status === 'qa') return 'border-amber-700/70 bg-amber-900/30 text-amber-200';
  if (status === 'deleted') return 'border-rose-700/70 bg-rose-900/30 text-rose-200';
  return 'border-slate-700/70 bg-slate-800/50 text-slate-200';
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const rawStatus = (firstParam(resolvedParams.status) ?? 'all').toLowerCase();
  const status = statuses.includes(rawStatus as (typeof statuses)[number]) ? rawStatus : 'all';
  const query = firstParam(resolvedParams.q)?.trim() ?? '';

  const session = await auth();
  const tenantId = Number((session as { tenantId?: unknown } | null)?.tenantId);
  const items = Number.isFinite(tenantId)
    ? await listContent(tenantId, {
        status: status === 'all' ? undefined : status,
        query: query || undefined,
      })
    : [];

  return (
    <section className="space-y-6 text-gray-100">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Content</h1>
          <p className="mt-1 text-sm text-gray-400">All ContentAI pipeline items for this tenant.</p>
        </div>
      </header>

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
          <label className="w-full text-sm text-gray-300 sm:max-w-48" htmlFor="content-status">
            Status
            <select
              id="content-status"
              name="status"
              defaultValue={status}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="qa">QA</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="flex-1 text-sm text-gray-300" htmlFor="content-q">
            Search
            <input
              id="content-q"
              name="q"
              defaultValue={query}
              placeholder="Title or slug"
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 placeholder:text-gray-500 focus:ring"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-sky-600 bg-sky-600/20 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-600/30"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800 text-sm text-gray-200">
            <thead className="bg-gray-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Created</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No content items found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-medium text-gray-100">
                      <Link href={`/admin/content/${item.slug}`} className="text-sky-300 hover:text-sky-200 hover:underline">
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{item.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs uppercase tracking-wide ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-300">{formatDate(item.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
