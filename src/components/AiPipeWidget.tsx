'use client';

import { useEffect, useState } from 'react';

interface AiPipeStats {
  runtime?: {
    latency_p50_ms?: number;
    latency_p95_ms?: number;
    providers?: Array<{
      provider: string;
      requests: number;
      cache_hits: number;
      total_cost_usd: number;
    }>;
    models?: Array<{
      model: string;
      requests: number;
      total_cost_usd: number;
    }>;
  };
  queue_depth?: number;
  savingsPercent?: number;
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ? 'text-green-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export function AiPipeWidget() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const [stats, setStats] = useState<AiPipeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const healthRes = await fetch('/api/aipipe/health');
      if (!healthRes.ok) {
        setStatus('unavailable');
        setError('AiPipe service is not running');
        return;
      }

      const statsRes = await fetch('/api/aipipe/stats');
      if (!statsRes.ok) {
        setStatus('unavailable');
        setError('Could not load router stats');
        return;
      }

      const data = (await statsRes.json()) as AiPipeStats;
      setStats(data);
      setStatus('ok');
      setError(null);
    } catch {
      setStatus('unavailable');
      setError('Could not reach router service');
    }
  };

  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const totalRequests = stats?.runtime?.providers?.reduce((sum, p) => sum + p.requests, 0) ?? 0;
  const totalCost = stats?.runtime?.providers?.reduce((sum, p) => sum + p.total_cost_usd, 0) ?? 0;
  const totalCacheHits = stats?.runtime?.providers?.reduce((sum, p) => sum + p.cache_hits, 0) ?? 0;
  const cacheHitPct = totalRequests > 0 ? Math.round((totalCacheHits / totalRequests) * 100) : 0;

  const topProvider = stats?.runtime?.providers?.reduce(
    (best, p) => (p.requests > (best?.requests ?? -1) ? p : best),
    null as (typeof stats.runtime.providers)[0] | null
  );

  const topModel = stats?.runtime?.models?.reduce(
    (best, m) => (m.requests > (best?.requests ?? -1) ? m : best),
    null as (typeof stats.runtime.models)[0] | null
  );

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading router stats…
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-red-400">Smart Router Offline</span>
        </div>
        <p className="text-xs text-gray-500">{error}</p>
        <p className="text-xs text-gray-600">
          AiPipe runs locally on port 8082.
          Start it with: <code className="text-gray-400">systemctl --user start aipipe</code>
        </p>
        <button
          onClick={() => { setStatus('loading'); void fetchStats(); }}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          Retry connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-sm font-medium text-green-400">Smart Router Online</span>
        <span className="ml-auto text-xs text-gray-600">refreshes every 30s</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Requests Routed"
          value={totalRequests.toLocaleString()}
          sub="all-time"
        />
        <StatCard
          label="Cost Saved vs GPT-4o"
          value={`${stats?.savingsPercent?.toFixed(1) ?? '0.0'}%`}
          sub={`$${totalCost.toFixed(4)} spent`}
          accent
        />
        <StatCard
          label="Cache Hit Rate"
          value={`${cacheHitPct}%`}
          sub={`${totalCacheHits} hits`}
        />
        <StatCard
          label="Queue Depth"
          value={String(stats?.queue_depth ?? 0)}
          sub={`p50 ${stats?.runtime?.latency_p50_ms ?? 0}ms`}
        />
      </div>

      {/* Provider breakdown */}
      {stats?.runtime?.providers && stats.runtime.providers.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Provider Breakdown</p>
          <div className="space-y-2">
            {stats.runtime.providers.map((p) => (
              <div key={p.provider} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-gray-300 capitalize">{p.provider}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${totalRequests > 0 ? (p.requests / totalRequests) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right">{p.requests} req</span>
                <span className="text-xs text-gray-600 w-20 text-right">${p.total_cost_usd.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top model */}
      {topModel && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Most Used Model</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white">{topModel.model}</span>
            <span className="text-xs text-gray-500">{topModel.requests} requests</span>
          </div>
        </div>
      )}

      {/* No data state */}
      {totalRequests === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4 text-center">
          <p className="text-sm text-gray-500">No requests routed yet.</p>
          <p className="text-xs text-gray-600 mt-1">
            Point your agents at <code className="text-gray-400">/api/aipipe/proxy/chat</code> to start routing.
          </p>
        </div>
      )}
    </div>
  );
}
