'use client';

import { useCallback, useEffect, useState } from 'react';
import { EventItem, EventTimeline } from '@/components/EventTimeline';

export function ActivityFeed() {
  const [events, setEvents] = useState<EventItem[]>([]);

  const load = useCallback(async () => {
    const response = await fetch('/api/events?limit=100', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as EventItem[];
    setEvents(data.slice(0, 100));
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [load]);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Activity Feed</h3>
      <EventTimeline events={events} />
    </div>
  );
}
