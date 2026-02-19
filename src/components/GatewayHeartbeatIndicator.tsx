'use client';

import { useEffect, useState } from 'react';

type GatewayConnection = { id: number; status: string; label?: string };

export function GatewayHeartbeatIndicator() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);

  const load = async () => {
    try {
      const res = await fetch('/api/gateway', { cache: 'no-store' });
      if (!res.ok) { setConnected(false); return; }
      const data = (await res.json()) as GatewayConnection[];
      const ok = Array.isArray(data) ? data.filter((g) => g.status === 'ok').length : 0;
      setCount(ok);
      setConnected(ok > 0);
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 20000);
    return () => clearInterval(interval);
  }, []);

  const dotClass =
    connected === null ? 'bg-gray-500 animate-pulse' :
    connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.7)]' :
    'bg-red-500';

  const label = connected === null ? 'Checking…' : connected ? `Gateway · ${count}` : 'Gateway offline';

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-300"
      title={label}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {connected ? 'Gateway' : 'Gateway'}
    </span>
  );
}
