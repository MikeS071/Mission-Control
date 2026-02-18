'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AgentStat = {
  id: number;
  agentName: string;
  tokens: number;
  costUsd: string;
  recordedAt: string;
};

export function AgentCostChart() {
  const [stats, setStats] = useState<AgentStat[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/agent-stats', { cache: 'no-store' }).catch(() => null);
    const data = (res?.ok ? await res.json() : []) as AgentStat[];
    setStats(data);
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

  const chartData = useMemo(
    () =>
      stats.map((s) => ({
        agentName: s.agentName,
        tokens: Number(s.tokens || 0),
        costUsd: Number(s.costUsd || '0'),
      })),
    [stats],
  );

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle>Per-Agent Token & Cost Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-700 p-4 text-sm text-gray-400">
            <p>No agent stats yet.</p>
            <p className="mt-1">POST to /api/agent-stats to record agent usage</p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="agentName" stroke="#9ca3af" />
                <YAxis yAxisId="tokens" stroke="#93c5fd" />
                <YAxis yAxisId="cost" orientation="right" stroke="#86efac" />
                <Tooltip />
                <Bar yAxisId="tokens" dataKey="tokens" name="Tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line yAxisId="cost" type="monotone" dataKey="costUsd" name="Cost (USD)" stroke="#22c55e" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
