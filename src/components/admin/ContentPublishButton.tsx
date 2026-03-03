'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ContentPublishButtonProps = {
  slug: string;
};

export function ContentPublishButton({ slug }: ContentPublishButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/content/${encodeURIComponent(slug)}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Failed to publish content');
        return;
      }

      router.refresh();
    } catch {
      setError('Failed to publish content');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending}
        className="rounded-md border border-emerald-700 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Publishing...' : 'Publish'}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
