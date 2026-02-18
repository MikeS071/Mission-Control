import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getTenantSubscription, isStripePlaceholderMode } from '@/lib/billing';
import { BillingClient } from './BillingClient';

export default async function BillingPage() {
  const session = await auth();
  if (!session) redirect('/signin');

  const tenantId = session.tenantId;
  if (!tenantId) redirect('/dashboard');

  const subscription = await getTenantSubscription(tenantId);
  const placeholderMode = isStripePlaceholderMode();

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Billing</h1>
        <Link href="/dashboard" className="text-sm text-indigo-300 hover:text-indigo-200">
          ← Back to dashboard
        </Link>
      </div>
      <BillingClient
        placeholderMode={placeholderMode}
        initial={{
          plan: subscription.plan,
          status: subscription.status,
          seats: subscription.seats,
        }}
      />
    </div>
  );
}
