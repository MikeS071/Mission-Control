'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { renderMarkdown } from '@/lib/markdown';

type ContentStatus = 'draft' | 'qa' | 'published' | 'deleted';

type ContentItemResponse = {
  id: number;
  tenantId: number;
  slug: string;
  title: string;
  summary: string;
  contentMd: string;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
};

const EDITABLE_STATUSES: ContentStatus[] = ['draft', 'qa', 'published'];

function statusBadgeClass(status: ContentStatus): string {
  if (status === 'published') return 'border-green-600 bg-green-900/40 text-green-200';
  if (status === 'qa') return 'border-amber-600 bg-amber-900/40 text-amber-200';
  if (status === 'deleted') return 'border-red-600 bg-red-900/40 text-red-200';
  return 'border-slate-600 bg-slate-800 text-slate-200';
}

export default function AdminContentDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = decodeURIComponent(params?.slug ?? '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentMd, setContentMd] = useState('');
  const [status, setStatus] = useState<ContentStatus>('draft');

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError('Invalid slug');
      return;
    }

    let alive = true;

    async function loadItem() {
      setLoading(true);
      setError(null);
      setMessage(null);

      const res = await fetch(`/api/admin/content/${encodeURIComponent(slug)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!alive) return;

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Failed to load content item' }));
        setError(typeof payload?.error === 'string' ? payload.error : 'Failed to load content item');
        setLoading(false);
        return;
      }

      const item = (await res.json()) as ContentItemResponse;
      setTitle(item.title ?? '');
      setSummary(item.summary ?? '');
      setContentMd(item.contentMd ?? '');
      setStatus(item.status ?? 'draft');
      setLoading(false);
    }

    void loadItem();

    return () => {
      alive = false;
    };
  }, [slug]);

  const previewHtml = useMemo(() => renderMarkdown(contentMd), [contentMd]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/content/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        summary,
        content_md: contentMd,
        status,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: 'Failed to save content item' }));
      setError(typeof payload?.error === 'string' ? payload.error : 'Failed to save content item');
      setSaving(false);
      return;
    }

    const updated = (await res.json()) as ContentItemResponse;
    setTitle(updated.title ?? '');
    setSummary(updated.summary ?? '');
    setContentMd(updated.contentMd ?? '');
    setStatus(updated.status ?? status);
    setMessage('Saved successfully');
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setMessage(null);

    const res = await fetch(`/api/admin/content/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: 'Failed to delete content item' }));
      setError(typeof payload?.error === 'string' ? payload.error : 'Failed to delete content item');
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setShowDeleteConfirm(false);
    router.push('/admin/content');
  }

  if (loading) {
    return (
      <section className="space-y-4 text-slate-100">
        <h1 className="text-2xl font-semibold tracking-tight">Content Detail</h1>
        <p className="text-sm text-slate-400">Loading content item...</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content Detail</h1>
          <p className="mt-1 text-sm text-slate-400">Slug: {slug}</p>
        </div>
        <Badge className={statusBadgeClass(status)} variant="outline">
          {status}
        </Badge>
      </header>

      {error ? (
        <div className="rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200" htmlFor="content-title">Title</label>
          <input
            id="content-title"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Content title"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200" htmlFor="content-summary">Summary</label>
          <textarea
            id="content-summary"
            className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Short summary"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200" htmlFor="content-status">Status</label>
          <select
            id="content-status"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500"
            value={status}
            onChange={(event) => setStatus(event.target.value as ContentStatus)}
          >
            {EDITABLE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-200" htmlFor="content-body">Content (Markdown)</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewMode((value) => !value)}
            >
              {previewMode ? 'Edit markdown' : 'Preview'}
            </Button>
          </div>

          {previewMode ? (
            <div className="prose prose-invert max-w-none rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-sm">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          ) : (
            <textarea
              id="content-body"
              className="min-h-80 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
              value={contentMd}
              onChange={(event) => setContentMd(event.target.value)}
              placeholder="# Write markdown content"
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleSave} disabled={saving || deleting}>
          {saving ? 'Saving...' : 'Save'}
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting}
        >
          Delete
        </Button>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete content item?</DialogTitle>
            <DialogDescription>
              This performs a soft delete by setting status to deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Confirm delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
