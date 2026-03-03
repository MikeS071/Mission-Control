'use client';

import { type ChangeEvent, useEffect, useState } from 'react';

type HeroImagePreviewProps = {
  slug: string;
  heroImageUrl?: string | null;
  onChange?: (nextUrl: string | null) => void;
};

export function HeroImagePreview({ slug, heroImageUrl = null, onChange }: HeroImagePreviewProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(heroImageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUrl(heroImageUrl);
  }, [heroImageUrl]);

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch(`/api/admin/content/${slug}/hero`, {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as { heroImageUrl?: string | null; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to upload hero image');
      }

      const nextUrl = payload.heroImageUrl ?? null;
      setCurrentUrl(nextUrl);
      onChange?.(nextUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload hero image');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }

  async function onDelete() {
    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/content/${slug}/hero`, {
        method: 'DELETE',
      });

      const payload = (await response.json()) as { heroImageUrl?: string | null; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to remove hero image');
      }

      setCurrentUrl(null);
      onChange?.(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove hero image');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-200">Hero Image</h2>
        {currentUrl ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting || isUploading}
            className="rounded-md border border-red-700 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
        ) : null}
      </div>

      {currentUrl ? (
        <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
          <img
            src={currentUrl}
            alt={`Hero preview for ${slug}`}
            className="h-56 w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950 text-sm text-gray-500">
          No hero image uploaded
        </div>
      )}

      <label className="mt-4 block text-sm text-gray-300" htmlFor="hero-image-upload">
        Upload image
      </label>
      <input
        id="hero-image-upload"
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        disabled={isUploading || isDeleting}
        className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 file:mr-3 file:rounded file:border-0 file:bg-sky-700/30 file:px-3 file:py-1.5 file:text-sky-100"
      />

      {isUploading ? <p className="mt-2 text-xs text-gray-400">Uploading image...</p> : null}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
