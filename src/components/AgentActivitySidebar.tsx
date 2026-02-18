'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type AgentStatus = 'working' | 'idle' | 'inactive';

type ActiveAgent = {
  agentName: string;
  tokens: number;
  costUsd: string;
  lastSeenAt: string;
  status: AgentStatus;
};

function timeSince(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusClasses(status: AgentStatus) {
  if (status === 'working') return 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.6)] animate-pulse';
  if (status === 'idle') return 'bg-yellow-400';
  return 'bg-gray-500';
}

function statusLabel(status: AgentStatus) {
  if (status === 'working') return 'Working';
  if (status === 'idle') return 'Idle';
  return 'Inactive';
}

export function AgentActivitySidebar() {
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [open, setOpen] = useState(false);
  const userToggled = useRef(false);

  const load = async () => {
    const response = await fetch('/api/agents/active', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as ActiveAgent[];
    setAgents(Array.isArray(data) ? data : []);

    if (!userToggled.current) {
      const hasActive = data.some((agent) => agent.status === 'working' || agent.status === 'idle');
      setOpen(hasActive);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const headingBadge = useMemo(() => {
    const working = agents.filter((agent) => agent.status === 'working').length;
    if (working > 0) return `${working} working`;
    return `${agents.length} tracked`;
  }, [agents]);

  return (
    <div className={`border-r border-gray-800 bg-gray-900/60 transition-all duration-200 ${open ? 'w-80 min-w-80' : 'w-12 min-w-12'}`}>
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-2">
        {open && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Agent Activity</span>
            <Badge variant="outline" className="text-[10px]">{headingBadge}</Badge>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-gray-300"
          onClick={() => {
            userToggled.current = true;
            setOpen((value) => !value);
          }}
          aria-label={open ? 'Collapse agent activity sidebar' : 'Expand agent activity sidebar'}
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <div className="max-h-[calc(100vh-240px)] space-y-2 overflow-auto p-2">
          {agents.length === 0 ? (
            <div className="rounded-md border border-gray-800 bg-gray-950 p-3 text-xs text-gray-400">No agent activity yet.</div>
          ) : (
            agents.map((agent) => (
              <div key={agent.agentName} className="rounded-md border border-gray-800 bg-gray-950 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white" title={agent.agentName}>{agent.agentName}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-300">
                    <span className={`h-2 w-2 rounded-full ${statusClasses(agent.status)}`} />
                    {statusLabel(agent.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>Tokens: <span className="text-gray-200">{agent.tokens.toLocaleString()}</span></div>
                  <div>Cost: <span className="text-gray-200">${agent.costUsd}</span></div>
                </div>
                <div className="mt-1 text-xs text-gray-500">Last activity: {timeSince(agent.lastSeenAt)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
