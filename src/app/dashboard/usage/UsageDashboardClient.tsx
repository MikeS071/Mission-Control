'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildUsageViewModel, type DateRangePreset } from '@/lib/usage-dashboard';

type UsagePayloadState = {
  summary: unknown;
  modelBreakdown: unknown;
  providerBreakdown: unknown;
  savings: unknown;
};

const RANGE_OPTIONS: Array<{ label: string; value: DateRangePreset }> = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
];

const PIE_COLORS = ['#38bdf8', '#2dd4bf', '#f59e0b', '#f97316', '#a78bfa', '#f43f5e'];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildRangeWindow(range: DateRangePreset) {
  const now = new Date();
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

async function safeFetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function SummaryCard({
  title,
  value,
  hint,
  badge,
}: {
  title: string;
  value: string;
  hint: string;
  badge?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{title}</div>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-2xl font-semibold text-white">{value}</p>
        {badge ? (
          <Badge className="border border-emerald-600/50 bg-emerald-900/35 text-[10px] text-emerald-200">
            {badge}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="h-72">{children}</div>
    </div>
  );
}

export function UsageDashboardClient() {
  const [range, setRange] = useState<DateRangePreset>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<UsagePayloadState>({
    summary: null,
    modelBreakdown: null,
    providerBreakdown: null,
    savings: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const window = buildRangeWindow(range);
        const query = `from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`;
        const [summary, modelBreakdown, providerBreakdown, savings] = await Promise.all([
          safeFetchJson(`/api/usage/summary?period=daily&${query}`, controller.signal),
          safeFetchJson(`/api/usage/breakdown?groupBy=model&${query}`, controller.signal),
          safeFetchJson(`/api/usage/breakdown?groupBy=provider&${query}`, controller.signal),
          safeFetchJson('/api/usage/savings', controller.signal),
        ]);

        setPayload({
          summary,
          modelBreakdown,
          providerBreakdown,
          savings,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load usage data.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [range]);

  const view = useMemo(
    () =>
      buildUsageViewModel({
        range,
        summary: payload.summary,
        modelBreakdown: payload.modelBreakdown,
        providerBreakdown: payload.providerBreakdown,
        savings: payload.savings,
      }),
    [payload, range],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-gray-800 bg-gray-900/70 p-1">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={range === option.value ? 'secondary' : 'ghost'}
              className={range === option.value ? 'bg-gray-700 text-white hover:bg-gray-700' : 'text-gray-400 hover:text-white'}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {loading ? 'Refreshing usage data...' : `Showing last ${view.dateRangeDays} days`}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-800/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          Unable to load all usage data: {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total Requests (Month)"
          value={view.totalRequestsMonth.toLocaleString('en-US')}
          hint="Summed from this month daily usage rows."
        />
        <SummaryCard
          title="Total Cost (Month)"
          value={formatCurrency(view.totalCostMonth)}
          hint="Actual routed request cost."
        />
        <SummaryCard
          title="Total Saved (Month)"
          value={formatCurrency(view.totalSavedMonth)}
          badge={`${view.savedPercentBadge.toFixed(1)}%`}
          hint="Estimated savings vs direct baseline."
        />
        <SummaryCard
          title="Budget Remaining"
          value={
            view.budget.hasLimit && view.budget.remainingUsd !== null
              ? formatCurrency(view.budget.remainingUsd)
              : 'No limit'
          }
          hint={
            view.budget.hasLimit && view.budget.limitUsd !== null
              ? `${formatCurrency(view.budget.limitUsd)} monthly budget limit`
              : 'Set a budget policy to track remaining spend.'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Daily Request Volume" subtitle="Requests per day in selected range.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view.dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="requests" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Cost" subtitle="Actual cost versus direct baseline to visualize savings gap.">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={view.dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Area type="monotone" dataKey="directCostUsd" stroke="#64748b" fill="#334155" fillOpacity={0.2} />
              <Area type="monotone" dataKey="costUsd" stroke="#2dd4bf" fill="#0f766e" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Model Breakdown" subtitle="Share of requests by model.">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={view.modelBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                labelLine={false}
              >
                {view.modelBreakdown.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Provider Breakdown" subtitle="Share of requests by provider.">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={view.providerBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                labelLine={false}
              >
                {view.providerBreakdown.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
