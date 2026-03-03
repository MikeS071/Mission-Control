'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { SocialPost } from '@/lib/content/social';

type Props = {
  slug: string;
  initialPosts: SocialPost[];
};

type FormState = {
  platform: 'x' | 'linkedin';
  text: string;
  scheduledAt: string;
};

function sortPosts(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}

export function SocialPostsSection({ slug, initialPosts }: Props) {
  const [posts, setPosts] = useState<SocialPost[]>(() => sortPosts(initialPosts));
  const [form, setForm] = useState<FormState>({
    platform: 'x',
    text: '',
    scheduledAt: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSubmitDisabled = useMemo(
    () =>
      submitting ||
      form.text.trim().length === 0 ||
      form.scheduledAt.trim().length === 0,
    [form.scheduledAt, form.text, submitting],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const scheduledAt = new Date(form.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError('Provide a valid schedule date and time.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/content/${slug}/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: form.platform,
          text: form.text.trim(),
          scheduledAt: scheduledAt.toISOString(),
        }),
      });

      const payload = (await response.json()) as SocialPost | { error?: string };
      if (!response.ok) {
        setError((payload as { error?: string }).error ?? 'Failed to schedule social post');
        return;
      }

      setPosts((current) => sortPosts([...current, payload as SocialPost]));
      setForm((current) => ({ ...current, text: '', scheduledAt: '' }));
      setSuccess('Social post scheduled.');
    } catch (requestError) {
      console.error('Schedule social post request failed:', requestError);
      setError('Failed to schedule social post');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Social Posts</h2>
        <p className="mt-1 text-sm text-gray-400">Schedule X and LinkedIn posts for this content item.</p>
      </div>

      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="text-sm text-gray-400">No posts scheduled yet.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((post, index) => (
              <li
                key={`${post.platform}-${post.scheduledAt}-${index}`}
                className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-gray-400">
                  <span>{post.platform}</span>
                  <span>{post.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-100">{post.text}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Scheduled: {new Date(post.scheduledAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/60 p-4" onSubmit={handleSubmit}>
        <h3 className="text-sm font-medium text-white">Schedule Post</h3>

        <label className="block space-y-1 text-sm text-gray-300">
          <span>Platform</span>
          <select
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            value={form.platform}
            onChange={(event) =>
              setForm((current) => ({ ...current, platform: event.target.value as 'x' | 'linkedin' }))
            }
          >
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </label>

        <label className="block space-y-1 text-sm text-gray-300">
          <span>Post Text</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            maxLength={280}
            value={form.text}
            onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
            placeholder="Share the key takeaway"
          />
        </label>

        <label className="block space-y-1 text-sm text-gray-300">
          <span>Scheduled Time</span>
          <input
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {success ? <p className="text-sm text-green-300">{success}</p> : null}

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="rounded-md bg-green-400 px-3 py-2 text-sm font-medium text-gray-950 transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Scheduling…' : 'Schedule Post'}
        </button>
      </form>
    </section>
  );
}
