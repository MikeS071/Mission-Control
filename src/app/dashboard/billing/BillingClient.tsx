'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type BillingStatus = {
  plan: 'free' | 'pro' | 'team';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  seats: number;
};

const PLAN_LABELS: Record<string, string> = {
  free:  'Initiate',
  pro:   'Strategos',
  team:  'Archon',
};

function PlanBadge({ plan }: { plan: string }) {
  const label = PLAN_LABELS[plan] ?? plan;
  const colors: Record<string, string> = {
    free:  'border-[#1a3020] text-[#a3b8a8]',
    pro:   'border-[rgba(45,212,122,0.3)] text-[#2dd47a] bg-[rgba(45,212,122,0.07)]',
    team:  'border-[rgba(255,59,111,0.3)] text-[#ff3b6f] bg-[rgba(255,59,111,0.07)]',
  };
  return (
    <span className={`inline-block rounded-full border px-3 py-0.5 text-xs font-bold font-mono tracking-wider uppercase ${colors[plan] ?? ''}`}>
      {label}
    </span>
  );
}

export function BillingClient({
  initial,
  placeholderMode,
}: {
  initial: BillingStatus;
  placeholderMode: boolean;
}) {
  const [state]   = useState<BillingStatus>(initial);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  // Auto-trigger checkout if ?plan=pro|team came from landing page CTA
  useEffect(() => {
    const plan = searchParams.get('plan');
    if ((plan === 'pro' || plan === 'team') && state.plan === 'free') {
      void startCheckout(plan);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(plan: 'pro' | 'team') {
    setLoading(true);
    try {
      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) { alert(data.error || 'Failed to start checkout'); return; }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const res  = await fetch('/api/billing/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) { alert(data.error || 'Failed to open billing portal'); return; }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 text-[#f1f5f0]">
      {placeholderMode && (
        <div className="rounded-lg border border-yellow-600/40 bg-yellow-950/20 p-3 text-sm text-yellow-300">
          Stripe not configured — running in test mode
        </div>
      )}

      {/* Current plan */}
      <div className="rounded-xl border border-[#1a3020] bg-[#0f2418] p-5">
        <p className="mb-2 text-xs font-mono uppercase tracking-widest text-[#6a7f6f]">Current plan</p>
        <div className="flex items-center gap-3">
          <PlanBadge plan={state.plan} />
          {state.status !== 'active' && (
            <span className="text-xs text-[#a3b8a8]">({state.status})</span>
          )}
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Strategos */}
        <div className={`rounded-xl border p-5 ${state.plan === 'pro' ? 'border-[#2dd47a]/40 bg-[#0f2418]' : 'border-[#1a3020] bg-[#0f2418]'}`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-base font-bold">Strategos</span>
            {state.plan === 'pro' && (
              <span className="rounded-full bg-[#2dd47a]/10 px-2 py-0.5 text-xs font-mono text-[#2dd47a]">current</span>
            )}
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#ff3b6f]">$59</span>
            <span className="text-sm text-[#a3b8a8]">/mo</span>
          </div>
          <ul className="mb-4 space-y-1 text-sm text-[#a3b8a8]">
            <li>✓ Kanban agent dashboard</li>
            <li>✓ Threaded agent chat</li>
            <li>✓ Cost savings tracking</li>
            <li>✓ 1 workspace</li>
          </ul>
          {state.plan === 'free' ? (
            <button
              onClick={() => startCheckout('pro')}
              disabled={loading}
              className="w-full rounded-lg py-2 text-sm font-bold text-white transition"
              style={{ background: 'linear-gradient(135deg,#2dd47a,#22a85f)' }}
            >
              {loading ? 'Loading…' : 'Upgrade to Strategos →'}
            </button>
          ) : state.plan === 'pro' ? (
            <button
              onClick={openPortal}
              disabled={loading}
              className="w-full rounded-lg border border-[#1a3020] py-2 text-sm text-[#a3b8a8] transition hover:text-[#f1f5f0]"
            >
              Manage billing →
            </button>
          ) : null}
        </div>

        {/* Archon */}
        <div className={`rounded-xl border p-5 ${state.plan === 'team' ? 'border-[#ff3b6f]/40 bg-[#0f2418]' : 'border-[#1a3020] bg-[#0f2418]'}`}>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-base font-bold">Archon</span>
            {state.plan === 'team' && (
              <span className="rounded-full bg-[#ff3b6f]/10 px-2 py-0.5 text-xs font-mono text-[#ff3b6f]">current</span>
            )}
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#ff3b6f]">$149</span>
            <span className="text-sm text-[#a3b8a8]">/mo</span>
          </div>
          <ul className="mb-4 space-y-1 text-sm text-[#a3b8a8]">
            <li>✓ Everything in Strategos</li>
            <li>✓ ContentAI pipeline</li>
            <li>✓ CoderAI agent</li>
            <li>✓ Unlimited workspaces</li>
          </ul>
          {state.plan !== 'team' ? (
            <button
              onClick={() => startCheckout('team')}
              disabled={loading}
              className="w-full rounded-lg py-2 text-sm font-bold text-white transition"
              style={{ background: 'linear-gradient(135deg,#ff3b6f,#e91e5a)' }}
            >
              {loading ? 'Loading…' : 'Upgrade to Archon →'}
            </button>
          ) : (
            <button
              onClick={openPortal}
              disabled={loading}
              className="w-full rounded-lg border border-[#1a3020] py-2 text-sm text-[#a3b8a8] transition hover:text-[#f1f5f0]"
            >
              Manage billing →
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-[#6a7f6f]">
        Cancel any time.
      </p>
    </div>
  );
}
