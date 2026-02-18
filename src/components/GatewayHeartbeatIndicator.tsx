'use client';

import { useEffect, useMemo, useState } from 'react';

type Heartbeat = {
  source: string;
  status: string;
  checkedAt: string;
};

type DotStatus = 'ok' | 'stale' | 'error';

function minsAgo(dateIso?: string) {
  if (!dateIso) return null;
  const diffMs = Date.now() - new Date(dateIso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.max(0, Math.floor(diffMs / 60000));
}

export function GatewayHeartbeatIndicator() {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);

  const load = async () => {
    const res = await fetch('/api/heartbeats', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as Heartbeat[];
    setHeartbeats(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const info = useMemo(() => {
    const gatewayRows = heartbeats
      .filter((row) => row.source === 'gateway' || row.source?.startsWith('gateway'))
      .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());

    const latest = gatewayRows[0];
    const minutes = minsAgo(latest?.checkedAt);

    let status: DotStatus = 'error';
    if (latest?.status === 'ok' && minutes !== null && minutes < 2) status = 'ok';
    else if (latest?.status === 'ok' && minutes !== null && minutes <= 10) status = 'stale';

    return { latest, minutes, status };
  }, [heartbeats]);

  const dotClass = info.status === 'ok' ? 'bg-emerald-400' : info.status === 'stale' ? 'bg-yellow-400' : 'bg-red-500';
  const label = info.minutes === null ? 'never' : `${info.minutes}m ago`;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-300"
      title={`Gateway: last checked ${label}`}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      Gateway
    </span>
  );
}
