'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { HeroImagePreview } from '@/components/HeroImagePreview';

type ContentStatus = 'draft' | 'qa' | 'published';

type ContentItem = {
  id: number;
  title: string;
  slug: string;
  status: ContentStatus;
  summary: string | null;
  contentMd: string;
  heroImageUrl: string | null;
  updatedAt: string;
};

function statusClass(status: ContentStatus): string {
  if (status === 'published') return 'border-emerald-700/70 bg-emerald-900/30 text-emerald-200';
  if (status === 'qa') return 'border-amber-700/70 bg-amber-900/30 text-amber-200';
  return 'border-slate-700/70 bg-slate-800/50 text-slate-200';
}

export default function AdminContentDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = useMemo(() => String(params?.slug ?? ''), [params]);

  const [item, setItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/content/${slug}`, { cache: 'no-store' });
        const payload = (await response.json()) as { item?: ContentItem; error?: string };

        if (ignore) return;

        if (!response.ok || !payload.item) {
          setError(payload.error ?? 'Failed to load content item');
          setItem(null);
        } else {
          setItem(payload.item);
        }
      } catch {
        if (!ignore) {
          setError('Failed to load content item');
          setItem(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    if (slug) {
      void load();
    }

    return () => {
      ignore = true;
    };
  }, [slug]);

  async function saveItem() {
    if (!item) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/content/${item.slug}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: item.title,
          summary: item.summary,
          contentMd: item.contentMd,
          status: item.status,
        }),
      });

      const payload = (await response.json()) as { item?: ContentItem; error?: string };

      if (!response.ok || !payload.item) {
        setError(payload.error ?? 'Save failed');
        return;
      }

      setItem(payload.item);
      setSuccess('Saved');
    } catch {
      setError('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteItem() {
    if (!item) return;

    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/content/${item.slug}`, {
        method: 'DELETE',
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'Delete failed');
        return;
      }

      setShowDeleteModal(false);
      router.push('/admin/content');
      router.refresh();
    } catch {
      setError('Delete failed');
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-4 text-gray-200">
        <p className="text-sm text-gray-400">Loading content item...</p>
      </section>
    );
  }

  if (!item) {
    return (
      <section className="space-y-4 text-gray-200">
        <p className="text-sm text-red-300">{error ?? 'Content item not found'}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 text-gray-100">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Content Detail</h1>
          <p className="mt-1 text-sm text-gray-400">Edit content fields and preview markdown.</p>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs uppercase tracking-wide ${statusClass(item.status)}`}>
          {item.status}
        </span>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
          <label className="block text-sm text-gray-300" htmlFor="content-title">
            Title
          </label>
          <input
            id="content-title"
            value={item.title}
            onChange={(event) => setItem({ ...item, title: event.target.value })}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
          />

          <label className="block text-sm text-gray-300" htmlFor="content-status">
            Status
          </label>
          <select
            id="content-status"
            value={item.status}
            onChange={(event) => setItem({ ...item, status: event.target.value as ContentStatus })}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
          >
            <option value="draft">Draft</option>
            <option value="qa">QA</option>
            <option value="published">Published</option>
          </select>

          <label className="block text-sm text-gray-300" htmlFor="content-summary">
            Summary
          </label>
          <textarea
            id="content-summary"
            value={item.summary ?? ''}
            onChange={(event) => setItem({ ...item, summary: event.target.value })}
            rows={4}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
          />

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300" htmlFor="content-body">
              Content (Markdown)
            </label>
            <button
              type="button"
              onClick={() => setPreviewMode((value) => !value)}
              className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
            >
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          </div>

          {previewMode ? (
            <pre className="min-h-80 whitespace-pre-wrap rounded-md border border-gray-700 bg-gray-950 p-3 text-sm text-gray-200">
              {item.contentMd || 'No markdown content yet.'}
            </pre>
          ) : (
            <textarea
              id="content-body"
              value={item.contentMd}
              onChange={(event) => setItem({ ...item, contentMd: event.target.value })}
              rows={16}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 font-mono text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
            />
          )}

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-300">{success}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveItem}
              disabled={isSaving || isDeleting}
              className="rounded-md border border-sky-600 bg-sky-600/20 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-600/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isSaving || isDeleting}
              className="rounded-md border border-red-700 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>

        <HeroImagePreview
          slug={item.slug}
          heroImageUrl={item.heroImageUrl}
          onChange={(heroImageUrl) => {
            setItem((current) => (current ? { ...current, heroImageUrl } : current));
          }}
        />
      </div>

      {showDeleteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5">
            <h2 className="text-lg font-semibold text-white">Delete Content Item?</h2>
            <p className="mt-2 text-sm text-gray-300">
              This will mark <span className="font-medium text-gray-100">{item.title}</span> as deleted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteItem}
                disabled={isDeleting}
                className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
