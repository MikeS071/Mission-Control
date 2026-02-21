'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Plan = 'initiate' | 'strategos' | 'archon';

const billingPlanMap: Record<Plan, 'free' | 'pro' | 'team'> = {
  initiate: 'free',
  strategos: 'pro',
  archon: 'team',
};

export default function SignupCompletePage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const planParam = (params.get('plan') as Plan) || 'initiate';
    if (planParam === 'strategos' || planParam === 'archon') {
      (async () => {
        try {
          const res = await fetch('/api/billing/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: billingPlanMap[planParam] }),
          });
          const data = await res.json();
          if (res.ok && data.url) {
            window.location.href = data.url as string;
            return;
          }
        } catch (error) {
          console.error('[signup/complete] checkout failed', error);
        }
        router.replace('/dashboard');
      })();
    } else {
      router.replace('/dashboard');
    }
  }, [params, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a1a12] px-4 text-center text-[#f1f5f0]">
      <div className="rounded-2xl border border-[#1a3020] bg-[#0f2418] px-8 py-10">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-[#6a7f6f]">Hold tight</p>
        <h1 className="mt-3 text-2xl font-semibold">Preparing your workspace…</h1>
        <p className="mt-2 text-sm text-[#a3b8a8]">We&apos;re finishing setup and will redirect you automatically.</p>
      </div>
    </main>
  );
}
