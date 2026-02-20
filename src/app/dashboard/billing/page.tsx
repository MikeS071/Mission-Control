import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getTenantSubscription, isStripePlaceholderMode } from '@/lib/billing';
import { BillingClient } from './BillingClient';

export default async function BillingPage() {
  const session = await auth();
  if (!session) redirect('/signin');

  const tenantId = session.tenantId;
  if (!tenantId) redirect('/dashboard');

  const subscription  = await getTenantSubscription(tenantId);
  const placeholderMode = isStripePlaceholderMode();

  return (
    <main className="min-h-screen p-6 text-[#f1f5f0]" style={{ background: '#0a1a12' }}>
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight">
              <span className="text-[#f1f5f0]">Archon</span>
              <span className="text-[#ef4444]">HQ</span>
              <span className="ml-2 text-base font-normal text-[#a3b8a8]">/ Billing</span>
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-[#a3b8a8] transition hover:text-[#f1f5f0]"
          >
            ← Back to dashboard
          </Link>
        </div>

        <Suspense fallback={null}>
          <BillingClient
            placeholderMode={placeholderMode}
            initial={{
              plan:   subscription.plan,
              status: subscription.status,
              seats:  subscription.seats,
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
