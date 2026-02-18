'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Task = { id: number; title: string; goal: string; assignedAgent: string | null; assigned_agent?: string | null };
type Heartbeat = { id: number; source: string; status: string; payload: string; checkedAt: string };
type GatewayConnection = { id: number; label: string; url: string; status: string; createdAt: string; lastCheckedAt: string | null };

type SparkPoint = { idx: number; value: number };

export function GatewayStatus() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [gateways, setGateways] = useState<GatewayConnection[]>([]);
  const [tokenSeries, setTokenSeries] = useState<Array<{ time: string; tokens: number }>>([]);

  const load = useCallback(async () => {
    const [tasksRes, heartbeatsRes, gatewaysRes, statsRes] = await Promise.all([
      fetch('/api/tasks', { cache: 'no-store' }).catch(() => null),
      fetch('/api/heartbeats', { cache: 'no-store' }).catch(() => null),
      fetch('/api/gateway', { cache: 'no-store' }).catch(() => null),
      fetch('/api/agent-stats', { cache: 'no-store' }).catch(() => null),
    ]);

    const allTasks = (tasksRes?.ok ? await tasksRes.json() : []) as Task[];
    const latestHeartbeats = (heartbeatsRes?.ok ? await heartbeatsRes.json() : []) as Heartbeat[];
    const gatewayRows = (gatewaysRes?.ok ? await gatewaysRes.json() : []) as GatewayConnection[];
    const statsRows = (statsRes?.ok ? await statsRes.json() : []) as Array<{ tokens?: number }>;

    setTasks(allTasks);
    setHeartbeats(latestHeartbeats);
    setGateways(gatewayRows);

    const totalTokens = statsRows.reduce((sum, item) => sum + Number(item.tokens ?? 0), 0);
    const point = { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), tokens: totalTokens };
    setTokenSeries((prev) => [...prev.slice(-11), point]);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const groupedByAgent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      const agent = task.assignedAgent || task.assigned_agent || 'Unassigned';
      if (!map[agent]) map[agent] = [];
      map[agent].push(task);
    }
    return map;
  }, [tasks]);

  const chartData = tokenSeries.length ? tokenSeries : [
    { time: 'T-4', tokens: 1200 },
    { time: 'T-3', tokens: 1400 },
    { time: 'T-2', tokens: 1350 },
    { time: 'T-1', tokens: 1600 },
    { time: 'Now', tokens: 1800 },
  ];

  const heartbeatSparks = useMemo(() => {
    const perSource: Record<string, Heartbeat[]> = {};
    for (const hb of heartbeats) {
      if (!perSource[hb.source]) perSource[hb.source] = [];
      perSource[hb.source].push(hb);
    }
    const result: Record<string, SparkPoint[]> = {};
    for (const [source, list] of Object.entries(perSource)) {
      result[source] = [...list]
        .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
        .slice(-10)
        .map((item, idx) => ({ idx, value: item.status === 'ok' ? 1 : 0 }));
    }
    return result;
  }, [heartbeats]);

  const connectedCount = gateways.filter((gateway) => gateway.status === 'ok').length;

  return (
    <div className="space-y-4">
      {gateways.length === 0 && (
        <Card className="border-indigo-700/50 bg-indigo-950/30">
          <CardContent className="py-4 text-sm text-indigo-100">
            Connect your OpenClaw gateway to unlock live status and health checks.{' '}
            <Link href="/dashboard/connect" className="font-semibold text-indigo-300 hover:text-indigo-200">Connect Gateway →</Link>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle>Gateway Connections</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-200">
          <div className="text-gray-300">Connected gateways: <span className="font-semibold text-white">{connectedCount}</span> / {gateways.length}</div>
          {gateways.length === 0 ? <p className="text-gray-400">No gateway connections yet.</p> : gateways.map((gateway) => (
            <div key={gateway.id} className="rounded-md border border-gray-800 p-2 flex items-center justify-between">
              <div><p className="font-medium">{gateway.label}</p><p className="text-xs text-gray-400">{gateway.url}</p></div>
              <span className={gateway.status === 'ok' ? 'text-green-400 text-xs' : 'text-red-400 text-xs'}>{gateway.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Heartbeat Status</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-gray-200">{heartbeats.length===0?<p className="text-gray-400">No heartbeat data yet.</p>:heartbeats.map((hb)=>{const mins=Math.max(0,Math.floor((Date.now()-new Date(hb.checkedAt).getTime())/60000));const sparkData=heartbeatSparks[hb.source]||[];return <div key={`${hb.source}-${hb.id}`} className="flex items-center justify-between rounded-md border border-gray-800 p-2 gap-2"><span><span className="font-medium">{hb.source}</span> <span className={`ml-2 ${hb.status==='ok'?'text-green-400':'text-red-400'}`}>{hb.status}</span></span><div className="flex items-center gap-3"><span className="text-gray-400">Last checked: {mins} min ago</span><div className="h-12 w-28"><ResponsiveContainer width="100%" height="100%"><LineChart data={sparkData}><Line type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={1.5} dot={false} /><YAxis hide domain={[0,1]} /><XAxis hide dataKey="idx" /><Tooltip formatter={(v)=>[Number(v)===1?'ok':'error','status']} /></LineChart></ResponsiveContainer></div></div></div>;})}</CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Token Usage Over Time</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><XAxis dataKey="time" stroke="#9ca3af" /><YAxis stroke="#9ca3af" /><Tooltip /><Line type="monotone" dataKey="tokens" stroke="#60a5fa" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>

      <Card className="bg-gray-900 border-gray-800"><CardHeader><CardTitle>Tasks Grouped by Agent</CardTitle></CardHeader><CardContent className="space-y-3">{Object.keys(groupedByAgent).length===0&&<p className="text-sm text-gray-400">No tasks found.</p>}{Object.entries(groupedByAgent).map(([agent,agentTasks])=><div key={agent} className="rounded-md border border-gray-800 p-3"><p className="font-semibold text-sm mb-2">{agent}</p><ul className="space-y-1 text-sm text-gray-300">{agentTasks.map((task)=><li key={task.id}>• {task.goal || 'Goal 1'} — {task.title}</li>)}</ul></div>)}</CardContent></Card>
    </div>
  );
}
