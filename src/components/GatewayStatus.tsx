'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type JsonObject = Record<string, unknown>;
type Task = { id: number; title: string; goal: string; assignedAgent: string | null; assigned_agent?: string | null };
type Heartbeat = { id: number; source: string; status: string; payload: string; checkedAt: string };

export function GatewayStatus() {
  const [rootData, setRootData] = useState<JsonObject | null>(null);
  const [statusData, setStatusData] = useState<JsonObject | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [tokenSeries, setTokenSeries] = useState<Array<{ time: string; tokens: number }>>([]);

  const load = useCallback(async () => {
    const [rootRes, statusRes, tasksRes, heartbeatsRes] = await Promise.all([
      fetch('/api/gateway', { cache: 'no-store' }).catch(() => null),
      fetch('/api/gateway/status', { cache: 'no-store' }).catch(() => null),
      fetch('/api/tasks', { cache: 'no-store' }).catch(() => null),
      fetch('/api/heartbeats', { cache: 'no-store' }).catch(() => null),
    ]);

    const root = (rootRes?.ok ? await rootRes.json() : { error: 'Gateway root unavailable' }) as JsonObject;
    const status = (statusRes?.ok ? await statusRes.json() : { error: 'Gateway status unavailable' }) as JsonObject;
    const allTasks = (tasksRes?.ok ? await tasksRes.json() : []) as Task[];
    const latestHeartbeats = (heartbeatsRes?.ok ? await heartbeatsRes.json() : []) as Heartbeat[];

    setRootData(root);
    setStatusData(status);
    setTasks(allTasks);
    setHeartbeats(latestHeartbeats);

    const merged = { ...root, ...status };
    const tokenVal = Number(merged.totalTokens ?? merged.tokensConsumed ?? merged.tokens ?? 0);
    const point = { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), tokens: tokenVal };
    setTokenSeries((prev) => [...prev.slice(-11), point]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    const interval = setInterval(() => {
      void load();
    }, 60000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [load]);

  const merged = useMemo(() => ({ ...(rootData || {}), ...(statusData || {}) }), [rootData, statusData]);
  const health = merged.error ? 'Unhealthy' : merged.health || merged.status || 'Unknown';
  const model = merged.model || merged.modelName || merged.defaultModel || 'Unknown';
  const uptime = merged.uptime || merged.uptimeSec || 'Unknown';
  const sessions = merged.sessionCount || merged.sessions || merged.activeSessions || 'Unknown';

  const groupedByAgent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      const agent = task.assignedAgent || task.assigned_agent || 'Unassigned';
      if (!map[agent]) map[agent] = [];
      map[agent].push(task);
    }
    return map;
  }, [tasks]);

  const chartData = tokenSeries.length
    ? tokenSeries
    : [
        { time: 'T-4', tokens: 1200 },
        { time: 'T-3', tokens: 1400 },
        { time: 'T-2', tokens: 1350 },
        { time: 'T-1', tokens: 1600 },
        { time: 'Now', tokens: 1800 },
      ];

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Gateway Health</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm text-gray-200 md:grid-cols-4"><div><span className="text-gray-400">Health: </span>{String(health)}</div><div><span className="text-gray-400">Model: </span>{String(model)}</div><div><span className="text-gray-400">Uptime: </span>{String(uptime)}</div><div><span className="text-gray-400">Sessions: </span>{String(sessions)}</div></CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Heartbeat Status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-gray-200">{heartbeats.length === 0 ? <p className="text-gray-400">No heartbeat data yet.</p> : heartbeats.map((hb) => { const mins = Math.max(0, Math.floor((Date.now() - new Date(hb.checkedAt).getTime()) / 60000)); return (<div key={`${hb.source}-${hb.id}`} className="flex items-center justify-between rounded-md border border-gray-800 p-2"><span><span className="font-medium">{hb.source}</span> <span className={`ml-2 ${hb.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{hb.status}</span></span><span className="text-gray-400">Last checked: {mins} min ago</span></div>); })}</CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Token Usage Over Time</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><XAxis dataKey="time" stroke="#9ca3af" /><YAxis stroke="#9ca3af" /><Tooltip /><Line type="monotone" dataKey="tokens" stroke="#60a5fa" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Tasks Grouped by Agent</CardTitle></CardHeader><CardContent className="space-y-3">{Object.keys(groupedByAgent).length === 0 && <p className="text-sm text-gray-400">No tasks found.</p>}{Object.entries(groupedByAgent).map(([agent, agentTasks]) => (<div key={agent} className="rounded-md border border-gray-800 p-3"><p className="font-semibold text-sm mb-2">{agent}</p><ul className="space-y-1 text-sm text-gray-300">{agentTasks.map((task) => (<li key={task.id}>• {task.goal || 'Goal 1'} — {task.title}</li>))}</ul></div>))}</CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Gateway Raw Data</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><pre className="text-xs text-green-400 overflow-auto max-h-72 bg-black/30 p-2 rounded">{JSON.stringify(rootData, null, 2)}</pre><pre className="text-xs text-cyan-300 overflow-auto max-h-72 bg-black/30 p-2 rounded">{JSON.stringify(statusData, null, 2)}</pre></CardContent></Card>
    </div>
  );
}
