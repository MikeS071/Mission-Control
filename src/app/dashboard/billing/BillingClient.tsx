'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type BillingStatus = {
  plan: 'free' | 'pro' | 'team';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  seats: number;
};

export function BillingClient({
  initial,
  placeholderMode,
}: {
  initial: BillingStatus;
  placeholderMode: boolean;
}) {
  const [state, setState] = useState<BillingStatus>(initial);
  const [seats, setSeats] = useState(Math.max(10, initial.seats || 10));
  const [loading, setLoading] = useState(false);

  async function refreshStatus() {
    const res = await fetch('/api/billing/status', { method: 'GET' });
    if (res.ok) {
      const data = (await res.json()) as BillingStatus;
      setState(data);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function startCheckout(plan: 'pro' | 'team') {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, seats: plan === 'team' ? seats : undefined }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        alert(data.error || 'Failed to start checkout');
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        alert(data.error || 'Failed to open billing portal');
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-lg border border-gray-800 bg-gray-900 p-6 text-white">
      {placeholderMode && (
        <div className="rounded border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-200">
          Stripe not configured — test mode
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold">Current plan: {state.plan.toUpperCase()}</h2>
        <p className="text-sm text-gray-400">Status: {state.status}</p>
        {state.plan === 'team' && <p className="text-sm text-gray-400">Seats: {state.seats}</p>}
      </div>

      <div className="space-y-3 rounded border border-gray-800 p-4">
        <h3 className="font-medium">Pro — $29/mo</h3>
        <Button onClick={() => startCheckout('pro')} disabled={loading}>
          Upgrade to Pro — $29/mo
        </Button>
      </div>

      <div className="space-y-3 rounded border border-gray-800 p-4">
        <h3 className="font-medium">Team — $19/seat/mo</h3>
        <label className="block text-sm text-gray-300">
          Seats (minimum 10)
          <input
            type="number"
            min={10}
            value={seats}
            onChange={(e) => setSeats(Math.max(10, Number(e.target.value || 10)))}
            className="mt-1 w-40 rounded border border-gray-700 bg-gray-950 px-2 py-1"
          />
        </label>
        <Button onClick={() => startCheckout('team')} disabled={loading}>
          Upgrade to Team
        </Button>
      </div>

      {state.plan !== 'free' && (
        <Button variant="secondary" onClick={openPortal} disabled={loading}>
          Manage Billing
        </Button>
      )}
    </div>
  );
}
