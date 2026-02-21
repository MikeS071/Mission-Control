'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ActivityFeed } from '@/components/ActivityFeed';

// ── Types ───────────────────────────────────────────────────────────────────

type AgentStatus = 'working' | 'idle' | 'inactive';

type ActiveAgent = {
  agentName: string;
  tokens: number;
  costUsd: string;
  lastSeenAt: string;
  status: AgentStatus;
};

type StatSummary = {
  activeAgents: number;
  tasksDoneToday: number;
  totalCostUsd: string;
  totalTokens: number;
};

type GatewayConnection = {
  id: number;
  label: string;
  url: string;
  status: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusDotClass(status: AgentStatus): string {
  if (status === 'working')
    return 'bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse';
  if (status === 'idle') return 'bg-yellow-400';
  return 'bg-gray-500';
}

function statusLabel(status: AgentStatus): string {
  if (status === 'working') return 'Working';
  if (status === 'idle') return 'Idle';
  return 'Offline';
}

// ── StatTile ─────────────────────────────────────────────────────────────────

type StatTileProps = {
  label: string;
  value: string | number;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
};

function StatTile({ label, value, icon, trend }: StatTileProps) {
  const trendColor =
    trend === 'up'
      ? 'text-emerald-400'
      : trend === 'down'
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 flex-1 min-w-0">
      <span className="text-xs text-gray-400 truncate">
        {icon ? `${icon} ` : ''}
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${trendColor === 'text-gray-400' ? 'text-white' : trendColor}`}>
        {value}
      </span>
    </div>
  );
}

// ── AgentTile ────────────────────────────────────────────────────────────────

function AgentTile({ agent }: { agent: ActiveAgent }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 min-w-[160px] max-w-[220px]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${statusDotClass(agent.status)}`} />
        <span className="truncate text-sm font-medium text-white" title={agent.agentName}>
          {agent.agentName}
        </span>
      </div>
      <span className="text-[11px] text-gray-400">{statusLabel(agent.status)}</span>
      <span className="text-[11px] text-gray-500">Last seen: {timeSince(agent.lastSeenAt)}</span>
    </div>
  );
}

// ── GatewayStrip ─────────────────────────────────────────────────────────────

function GatewayStrip({ gateways }: { gateways: GatewayConnection[] }) {
  const connected = gateways.filter((g) => g.status === 'ok').length;
  const total = gateways.length;

  if (total === 0) {
    return (
      <div className="rounded-md border border-gray-800 bg-gray-900/60 px-4 py-2 text-xs text-gray-400 flex items-center gap-2">
        <span className="text-red-400">🔴</span>
        No gateways configured —{' '}
        <Link href="/dashboard/connect" className="text-indigo-300 hover:text-indigo-200 font-medium">
          Connect one
        </Link>
      </div>
    );
  }

  const allOk = connected === total;
  const icon = allOk ? '✅' : connected > 0 ? '🟡' : '🔴';
  const text =
    connected === 0
      ? 'Gateway offline'
      : connected === 1
        ? '1 gateway connected'
        : `${connected} gateways connected`;

  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/60 px-4 py-2 text-xs text-gray-300 flex items-center gap-2">
      <span>{icon}</span>
      <span>{text}</span>
      {!allOk && total > 0 && (
        <span className="text-gray-500">({total - connected} offline)</span>
      )}
    </div>
  );
}

// ── ActivityTab ───────────────────────────────────────────────────────────────

const DASH = '—';

export function ActivityTab() {
  const [stats, setStats] = useState<StatSummary | null>(null);
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [gateways, setGateways] = useState<GatewayConnection[]>([]);

  // Poll /api/stats/summary every 30s
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats/summary', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StatSummary;
        setStats(data);
      } catch {
        // silent — keep showing last value or dash
      }
    };

    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Poll /api/agents/active every 10s
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agents/active', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as ActiveAgent[];
        setAgents(Array.isArray(data) ? data : []);
      } catch {
        // silent
      }
    };

    void fetchAgents();
    const interval = setInterval(() => void fetchAgents(), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Poll /api/gateway every 60s (gateway status changes rarely)
  useEffect(() => {
    const fetchGateways = async () => {
      try {
        const res = await fetch('/api/gateway', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as GatewayConnection[];
        setGateways(Array.isArray(data) ? data : []);
      } catch {
        // silent
      }
    };

    void fetchGateways();
    const interval = setInterval(() => void fetchGateways(), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Format stat values (show — until first fetch)
  const statActiveAgents: string | number = stats !== null ? stats.activeAgents : DASH;
  const statTasksToday: string | number = stats !== null ? stats.tasksDoneToday : DASH;
  const statCost: string = stats !== null ? `$${Number(stats.totalCostUsd).toFixed(2)}` : DASH;
  const statTokens: string | number =
    stats !== null
      ? stats.totalTokens > 1_000_000
        ? `${(stats.totalTokens / 1_000_000).toFixed(1)}M`
        : stats.totalTokens > 1_000
          ? `${(stats.totalTokens / 1_000).toFixed(1)}K`
          : stats.totalTokens
      : DASH;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Stat strip */}
      <div className="flex gap-3 flex-wrap">
        <StatTile label="Active Agents" value={statActiveAgents} icon="🤖" />
        <StatTile label="Tasks Done Today" value={statTasksToday} icon="✅" />
        <StatTile label="Total Cost" value={statCost} icon="💰" />
        <StatTile label="Tokens Used" value={statTokens} icon="⚡" />
      </div>

      {/* 2. Agent tiles (live, kan-3) */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Live Agent Team
        </h3>
        {agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 px-4 py-3 text-sm text-gray-400">
            No agents connected —{' '}
            <Link href="/dashboard/connect" className="text-indigo-300 hover:text-indigo-200 font-medium">
              connect via Setup Wizard
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {agents.map((agent) => (
              <AgentTile key={agent.agentName} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* 3. Gateway status strip */}
      <GatewayStrip gateways={gateways} />

      {/* 4. Activity feed */}
      <ActivityFeed />
    </div>
  );
}
