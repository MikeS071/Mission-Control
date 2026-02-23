'use client';

import { useState } from 'react';

export type ActivityEvent = {
  id: string;
  eventType: string;
  displayName: string;
  description: string;
  icon: string;
  createdAt: string;
  reactions: { hype: number; respect: number; tribute: number };
};

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function ReactionPill({
  emoji,
  label,
  count,
}: {
  emoji: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      title={label}
      className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
        count > 0
          ? 'border-gray-600 bg-gray-800 text-gray-300'
          : 'border-gray-800 bg-transparent text-gray-600 hover:border-gray-600 hover:text-gray-400'
      }`}
    >
      {emoji}
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

export function SocialEventTile({ event }: { event: ActivityEvent }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const ago = timeAgo(event.createdAt);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5 space-y-1.5">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 flex-shrink-0">{event.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-200 truncate">
              {event.displayName}
            </span>
            <span className="text-[10px] text-gray-600 flex-shrink-0">{ago}</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">{event.description}</p>
        </div>
      </div>

      {/* Stub ReactionBar */}
      <div className="flex items-center gap-1.5 pl-7">
        <ReactionPill emoji="🔥" label="Hype" count={event.reactions.hype} />
        <ReactionPill emoji="💪" label="Respect" count={event.reactions.respect} />
        <ReactionPill emoji="⚡" label="Tribute" count={event.reactions.tribute} />
        <button
          type="button"
          onClick={() => setCommentsOpen((v) => !v)}
          className="ml-auto text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          💬 {commentsOpen ? 'Hide' : 'Comment'}
        </button>
      </div>

      {/* Stub CommentThread */}
      {commentsOpen && (
        <div className="pl-7 pt-1 border-t border-gray-800">
          <p className="text-[10px] text-gray-600">Comments coming in Step 8…</p>
        </div>
      )}
    </div>
  );
}
