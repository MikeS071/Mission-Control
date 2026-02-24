'use client';

import { useEffect, useMemo, useState } from 'react';

export type ReactionCounts = { hype: number; respect: number; tribute: number };

export type ActivityEvent = {
  id: string;
  eventType: string;
  displayName: string;
  description: string;
  icon: string;
  createdAt: string;
  reactions?: ReactionCounts;
  commentCount?: number;
};

type ReactionKey = keyof ReactionCounts;

type ApiComment = {
  id: string;
  eventId: string;
  tenantId: number;
  tenantName: string;
  body: string;
  createdAt: string;
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
  active,
  onClick,
}: {
  emoji: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
        active
          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
          : count > 0
            ? 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500'
            : 'border-gray-800 bg-transparent text-gray-600 hover:border-gray-600 hover:text-gray-400'
      }`}
    >
      <span className="leading-none">{emoji}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

function ReactionBar({
  initial,
  commentCount,
  onToggleComments,
  commentsOpen,
}: {
  initial: ReactionCounts;
  commentCount: number;
  onToggleComments: () => void;
  commentsOpen: boolean;
}) {
  const [counts, setCounts] = useState<ReactionCounts>(initial);
  const [mine, setMine] = useState<Record<ReactionKey, boolean>>({
    hype: false,
    respect: false,
    tribute: false,
  });

  // Keep local counts in sync if parent updates via SSE/pagination.
  useEffect(() => {
    setCounts(initial);
  }, [initial.hype, initial.respect, initial.tribute]);

  const defs = useMemo(
    () =>
      [
        { key: 'hype' as const, emoji: '🔥', label: 'Hype' },
        { key: 'respect' as const, emoji: '💪', label: 'Respect' },
        { key: 'tribute' as const, emoji: '⚡', label: 'Tribute' },
      ],
    [],
  );

  function toggle(key: ReactionKey) {
    // IMPORTANT: keep updater functions pure (no nested setState side effects),
    // otherwise React Strict Mode may invoke updater twice and double-increment.
    const willActivate = !mine[key];

    setMine((prev) => ({ ...prev, [key]: willActivate }));
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + (willActivate ? 1 : -1)),
    }));
  }

  return (
    <div className="flex items-center gap-1.5">
      {defs.map((d) => (
        <ReactionPill
          key={d.key}
          emoji={d.emoji}
          label={d.label}
          count={counts[d.key]}
          active={mine[d.key]}
          onClick={() => toggle(d.key)}
        />
      ))}

      <button
        type="button"
        onClick={onToggleComments}
        aria-label={commentsOpen ? 'Hide comments' : 'Show comments'}
        aria-expanded={commentsOpen}
        title={commentsOpen ? 'Hide comments' : 'Show comments'}
        className={
          `ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ` +
          (commentsOpen
            ? 'text-gray-200 bg-gray-800/60 hover:bg-gray-800'
            : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/30')
        }
      >
        <span className="leading-none">💬</span>
        <span className={commentCount > 0 ? 'text-gray-400' : 'text-gray-700'}>{commentCount}</span>
      </button>
    </div>
  );
}

function CommentThread({
  eventId,
  onCountKnown,
  onCommentAdded,
}: {
  eventId: string;
  onCountKnown?: (count: number) => void;
  onCommentAdded?: () => void;
}) {
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);

    fetch(`/api/activity/comments?eventId=${encodeURIComponent(eventId)}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { comments: ApiComment[] };
      })
      .then((data) => {
        if (data?.comments) {
          setComments(data.comments);
          onCountKnown?.(data.comments.length);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [eventId]);

  async function add() {
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    try {
      const res = await fetch('/api/activity/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, body }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; comment?: ApiComment };

      if (data.comment) {
        setComments((prev) => [...prev, data.comment!]);
        setDraft('');
        onCommentAdded?.();
      }
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <p className="text-[10px] text-gray-700">Loading comments…</p>
      ) : comments.length > 0 ? (
        <div className="space-y-1">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md border border-gray-800 bg-black/20 px-2 py-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1 text-[11px] text-gray-400 whitespace-pre-wrap break-words">
                  <span className="text-[10px] font-medium text-gray-300">{c.tenantName}</span>
                  <span className="text-gray-600"> </span>
                  <span className="text-[11px] text-gray-400">{c.body}</span>
                </div>
                <span className="text-[10px] text-gray-600 flex-shrink-0">{timeAgo(c.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-600">No comments yet. Be the first.</p>
      )}

      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void add();
            }
          }}
          rows={2}
          placeholder="Write a comment…"
          className="min-h-[40px] flex-1 resize-none rounded-md border border-gray-800 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={posting}
          title="Post comment"
          aria-label="Post comment"
          className="h-7 w-7 rounded-md border border-gray-800 bg-gray-900 text-[11px] text-gray-300 hover:border-gray-600 flex items-center justify-center disabled:opacity-50"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

export function SocialEventTile({ event }: { event: ActivityEvent }) {
  const [commentsOpen, setCommentsOpen] = useState(false);

  const ago = timeAgo(event.createdAt);
  const reactions: ReactionCounts = event.reactions ?? { hype: 0, respect: 0, tribute: 0 };

  const [commentCount, setCommentCount] = useState(event.commentCount ?? 0);
  useEffect(() => {
    setCommentCount(event.commentCount ?? 0);
  }, [event.commentCount]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5 space-y-1.5">
      {/* Header row */}
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 flex-shrink-0">{event.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1 flex-wrap">
            <span className="text-[11px] font-semibold text-gray-200 truncate">{event.displayName}</span>
            <span className="text-[10px] text-gray-600 flex-shrink-0">{ago}</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">{event.description}</p>
        </div>
      </div>

      {/* ReactionBar */}
      <div className="pl-7">
        <ReactionBar
          initial={reactions}
          commentCount={commentCount}
          commentsOpen={commentsOpen}
          onToggleComments={() => setCommentsOpen((v) => !v)}
        />
      </div>

      {/* CommentThread */}
      {commentsOpen && (
        <div className="pl-7 pt-2 border-t border-gray-800">
          <CommentThread
            eventId={event.id}
            onCountKnown={(n) => setCommentCount((prev) => Math.max(prev, n))}
            onCommentAdded={() => setCommentCount((c) => c + 1)}
          />
        </div>
      )}
    </div>
  );
}
