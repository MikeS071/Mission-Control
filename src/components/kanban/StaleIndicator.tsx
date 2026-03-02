import { getDaysSinceUpdate, getStaleLevel } from '@/lib/kanban/staleDetector';

type StaleIndicatorProps = {
  updatedAt: Date;
};

export function StaleIndicator({ updatedAt }: StaleIndicatorProps) {
  const staleLevel = getStaleLevel({ updatedAt });
  if (staleLevel === 'fresh') return null;

  const daysSinceUpdate = getDaysSinceUpdate({ updatedAt });
  const title = `Last updated ${daysSinceUpdate} days ago`;

  if (staleLevel === 'aging') {
    return (
      <span
        className="inline-flex items-center rounded-full border border-amber-700/70 bg-amber-950/40 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-amber-200"
        title={title}
        aria-label={title}
      >
        Aging
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-rose-700/70 bg-rose-950/40 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-rose-200"
      title={title}
      aria-label={title}
    >
      Stale
    </span>
  );
}
