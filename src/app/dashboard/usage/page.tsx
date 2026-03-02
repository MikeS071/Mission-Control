import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { UsageDashboardClient } from './UsageDashboardClient';

const DASHBOARD_NAV_LINKS = [
  { href: '/dashboard', label: 'Mission Control' },
  { href: '/dashboard/usage', label: 'Usage' },
  { href: '/dashboard/connect', label: 'Connect Gateway' },
  { href: '/dashboard/billing', label: 'Billing' },
];

export default async function UsagePage() {
  const session = await auth();
  if (!session) redirect('/signin');

  return (
    <main className="min-h-screen bg-gray-950 p-6 text-gray-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-white">Usage Dashboard</h1>
            <p className="mt-1 text-sm text-gray-400">Track request volume, cost, savings, and budget in one place.</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="h-fit rounded-lg border border-gray-800 bg-gray-900/70 p-3">
            <p className="px-2 text-xs uppercase tracking-wide text-gray-500">Dashboard</p>
            <nav className="mt-2 space-y-1">
              {DASHBOARD_NAV_LINKS.map((item) => {
                const active = item.href === '/dashboard/usage';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-2 py-2 text-sm transition ${
                      active
                        ? 'bg-sky-900/30 text-sky-200'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <section>
            <UsageDashboardClient />
          </section>
        </div>
      </div>
    </main>
  );
}

