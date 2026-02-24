'use client';

import { useMemo, useState } from 'react';

export type ActivityEvent = {
  id: string;
  eventType: string;
  displayName: string;
  description: string;
  icon: string;
  createdAt: string;
  reactions: { hype: number; respect: number; tribute: number };
};

type ReactionKey = keyof ActivityEvent['reactions'];

type Comment = {
  id: string;
  author: string;
  content: string;
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
  onOpenComments,
  commentsOpen,
}: {
  initial: ActivityEvent['reactions'];
  onOpenComments: () => void;
  commentsOpen: boolean;
}) {
  const [counts, setCounts] = useState(initial);
  const [mine, setMine] = useState<Record<ReactionKey, boolean>>({
    hype: false,
    respect: false,
    tribute: false,
  });

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
        onClick={onOpenComments}
        className="ml-auto text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
      >
        💬 {commentsOpen ? 'Hide' : 'Comment'}
      </button>
    </div>
  );
}

function CommentThread() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');

  function add() {
    const content = draft.trim();
    if (!content) return;

    setComments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        author: 'You',
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      {comments.length > 0 ? (
        <div className="space-y-1">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md border border-gray-800 bg-black/20 px-2 py-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-medium text-gray-300">{c.author}</span>
                <span className="text-[10px] text-gray-600">{timeAgo(c.createdAt)}</span>
              </div>
              <div className="text-[11px] text-gray-400 whitespace-pre-wrap">{c.content}</div>
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
              add();
            }
          }}
          rows={2}
          placeholder="Write a comment…"
          className="min-h-[40px] flex-1 resize-none rounded-md border border-gray-800 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
        <button
          type="button"
          onClick={add}
          title="Post comment"
          aria-label="Post comment"
          className="h-7 w-7 rounded-md border border-gray-800 bg-gray-900 text-[11px] text-gray-300 hover:border-gray-600 flex items-center justify-center"
        >
          ➤
        </button>
      </div>

      <p className="text-[10px] text-gray-700">
        Step 8: local-only UI — persistence + multi-user sync comes later.
      </p>
    </div>
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

      {/* ReactionBar */}
      <div className="pl-7">
        <ReactionBar
          initial={event.reactions}
          commentsOpen={commentsOpen}
          onOpenComments={() => setCommentsOpen((v) => !v)}
        />
      </div>

      {/* CommentThread */}
      {commentsOpen && (
        <div className="pl-7 pt-2 border-t border-gray-800">
          <CommentThread />
        </div>
      )}
    </div>
  );
}
