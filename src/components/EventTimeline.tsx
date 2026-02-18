'use client';

import { Badge } from '@/components/ui/badge';

export type EventItem = {
  id: number;
  taskId: number | null;
  taskTitle: string | null;
  agentName: string | null;
  eventType: string;
  payload: string | null;
  createdAt: string | Date | null;
};

function eventColor(type: string) {
  if (type === 'created') return 'border-green-600/40 bg-green-600/10 text-green-300';
  if (type === 'status_change') return 'border-blue-600/40 bg-blue-600/10 text-blue-300';
  if (type === 'deleted') return 'border-red-600/40 bg-red-600/10 text-red-300';
  if (type === 'comment') return 'border-purple-600/40 bg-purple-600/10 text-purple-300';
  return 'border-gray-600/40 bg-gray-600/10 text-gray-300';
}

export function formatRelativeTime(value: string | Date | null) {
  if (!value) return 'just now';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleString();
}

export function EventTimeline({ events }: { events: EventItem[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No activity yet</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((item) => (
        <div key={item.id} className="rounded-md border border-gray-800 bg-gray-950/70 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>{formatRelativeTime(item.createdAt)}</span>
            <span>•</span>
            <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {item.agentName || 'system'}
            </Badge>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${eventColor(item.eventType)}`}>
              {item.eventType}
            </Badge>
          </div>
          <p className="text-sm text-white">{item.taskTitle || 'Untitled task'}</p>
          {item.payload && <p className="mt-1 text-xs text-gray-300 whitespace-pre-wrap">{item.payload}</p>}
        </div>
      ))}
    </div>
  );
}
