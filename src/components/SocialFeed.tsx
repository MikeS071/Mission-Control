'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityEvent, SocialEventTile } from './SocialEventTile';

type ApiResponse = {
  events: ActivityEvent[];
  nextCursor: string | null;
};

export function SocialFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pendingEvents, setPendingEvents] = useState<ActivityEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const fetchPage = useCallback(async (cursor?: string): Promise<ApiResponse | null> => {
    try {
      const url = `/api/activity/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as ApiResponse;
    } catch {
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchPage().then((data) => {
      if (data) {
        setEvents(data.events);
        setNextCursor(data.nextCursor);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fetchPage]);

  // SSE subscription
  useEffect(() => {
    const sse = new EventSource('/api/activity/stream');
    sseRef.current = sse;

    sse.addEventListener('activity.event.created', (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as ActivityEvent;
        const event: ActivityEvent = {
          ...raw,
          reactions: raw.reactions ?? { hype: 0, respect: 0, tribute: 0 },
          commentCount: raw.commentCount ?? 0,
        };
        setPendingEvents((prev) => [event, ...prev]);
        setPendingCount((c) => c + 1);
      } catch { /* ignore malformed */ }
    });

    sse.addEventListener('activity.reaction.updated', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          eventId: string;
          reactions?: ActivityEvent['reactions'];
          counts?: ActivityEvent['reactions'];
        };
        const reactions = payload.reactions ?? payload.counts;
        if (!payload.eventId || !reactions) return;

        setEvents((prev) =>
          prev.map((ev) => (ev.id === payload.eventId ? { ...ev, reactions } : ev))
        );
        setPendingEvents((prev) =>
          prev.map((ev) => (ev.id === payload.eventId ? { ...ev, reactions } : ev))
        );
      } catch { /* ignore malformed */ }
    });

    sse.addEventListener('activity.comment.created', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { eventId: string };
        if (!payload.eventId) return;

        const bump = (ev: ActivityEvent) =>
          ev.id === payload.eventId
            ? { ...ev, commentCount: (ev.commentCount ?? 0) + 1 }
            : ev;

        setEvents((prev) => prev.map(bump));
        setPendingEvents((prev) => prev.map(bump));
      } catch { /* ignore malformed */ }
    });

    return () => sse.close();
  }, []);

  const showPending = () => {
    setEvents((prev) => [...pendingEvents, ...prev]);
    setPendingEvents([]);
    setPendingCount(0);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPage(nextCursor);
    if (data) {
      setEvents((prev) => [...prev, ...data.events]);
      setNextCursor(data.nextCursor);
    }
    setLoadingMore(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* New events banner */}
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={showPending}
          className="flex-shrink-0 mx-2 mt-2 rounded-md border border-indigo-700 bg-indigo-950/60 px-3 py-1.5 text-[11px] text-indigo-300 hover:bg-indigo-900/60 transition-colors text-left"
        >
          ↑ {pendingCount} new event{pendingCount > 1 ? 's' : ''} — tap to show
        </button>
      )}

      {/* Scrollable feed */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700">
        {loading && (
          <div className="text-[11px] text-gray-600 text-center py-8">Loading…</div>
        )}

        {!loading && events.length === 0 && (
          <div className="text-center py-8 space-y-1">
            <div className="text-lg">🌿</div>
            <div className="text-[11px] text-gray-500">No activity yet…</div>
            <div className="text-[10px] text-gray-700">Events will appear here as your agents work.</div>
          </div>
        )}

        {events.map((event) => (
          <SocialEventTile key={event.id} event={event} />
        ))}

        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="w-full mt-1 rounded border border-gray-800 bg-gray-900/40 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
