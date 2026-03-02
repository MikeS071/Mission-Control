import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentStats, events, memberships, tasks, tenants, users } from '@/db/schema';

type TenantRecord = {
  id: number;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date | null;
};

type TenantUserRecord = {
  id: number | null;
  email: string;
  name: string | null;
  role: string;
  joinedAt: Date | null;
};

type TenantUsageRecord = {
  taskCount: number;
  eventCount: number;
  totalTokens: number;
  totalCostUsd: string;
} | null;

type AdminTenantDetailData = {
  tenant: TenantRecord;
  users: TenantUserRecord[];
  usage: TenantUsageRecord;
};

const createdDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function parseTenantId(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDate(value: Date | null): string {
  if (!value) return 'Unknown';
  return createdDateFormatter.format(value);
}

async function loadAdminTenantDetailData(tenantId: number): Promise<AdminTenantDetailData | null> {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const tenantUsers = await db
    .select({
      id: users.id,
      email: memberships.userEmail,
      name: users.name,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .leftJoin(users, eq(users.email, memberships.userEmail))
    .where(eq(memberships.tenantId, tenantId))
    .orderBy(memberships.createdAt);

  const usageResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM ${tasks} WHERE ${tasks.tenantId} = ${tenantId}) as task_count,
      (SELECT COUNT(*)::int FROM ${events} WHERE ${events.tenantId} = ${tenantId}) as event_count,
      COALESCE(SUM(${agentStats.tokens}), 0)::bigint as total_tokens,
      COALESCE(SUM(${agentStats.costUsd}::numeric), 0)::numeric(12,4)::text as total_cost_usd
    FROM ${agentStats}
    WHERE ${agentStats.tenantId} = ${tenantId}
  `);

  const usageRow = usageResult.rows[0] as
    | {
        task_count?: number | string | null;
        event_count?: number | string | null;
        total_tokens?: number | string | null;
        total_cost_usd?: string | number | null;
      }
    | undefined;

  const rawTaskCount = Number(usageRow?.task_count ?? 0);
  const rawEventCount = Number(usageRow?.event_count ?? 0);
  const rawTotalTokens = Number(usageRow?.total_tokens ?? 0);
  const rawTotalCostUsd = Number(usageRow?.total_cost_usd ?? 0);
  const taskCount = Number.isFinite(rawTaskCount) ? rawTaskCount : 0;
  const eventCount = Number.isFinite(rawEventCount) ? rawEventCount : 0;
  const totalTokens = Number.isFinite(rawTotalTokens) ? rawTotalTokens : 0;
  const totalCostUsd = Number.isFinite(rawTotalCostUsd) ? rawTotalCostUsd : 0;

  const usage =
    usageRow && (taskCount > 0 || eventCount > 0 || totalTokens > 0 || totalCostUsd > 0)
      ? {
          taskCount,
          eventCount,
          totalTokens,
          totalCostUsd: totalCostUsd.toFixed(4),
        }
      : null;

  return {
    tenant,
    users: tenantUsers,
    usage,
  };
}

function renderPanel(message: string) {
  return (
    <main className="min-h-screen bg-gray-950 px-6 py-10 text-gray-100">
      <div className="mx-auto max-w-5xl rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-200">
        {message}
      </div>
    </main>
  );
}

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = parseTenantId(id);

  if (!tenantId) {
    return renderPanel('Invalid tenant ID.');
  }

  let detail: AdminTenantDetailData | null;
  try {
    detail = await loadAdminTenantDetailData(tenantId);
  } catch (error) {
    console.error('Admin tenant detail query failed:', error);
    return renderPanel('Failed to load tenant details.');
  }

  if (!detail) {
    return renderPanel('Tenant not found.');
  }

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-8 text-gray-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Admin / Tenant Detail</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{detail.tenant.name}</h1>
            <p className="mt-2 text-sm text-gray-400">Tenant ID: {detail.tenant.id}</p>
          </div>
          <Link href="/admin/tenants" className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-900">
            Back to tenants
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Slug</p>
            <p className="mt-2 text-sm font-medium text-white">{detail.tenant.slug}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Plan</p>
            <p className="mt-2 text-sm font-medium capitalize text-white">{detail.tenant.plan}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Created</p>
            <p className="mt-2 text-sm font-medium text-white">{formatDate(detail.tenant.createdAt)}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">Users</p>
            <p className="mt-2 text-sm font-medium text-white">{detail.users.length}</p>
          </div>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Users in Tenant</h2>
          {detail.users.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">No users found for this tenant.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Role</th>
                    <th className="py-2 pr-4 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 text-gray-200">
                  {detail.users.map((user) => (
                    <tr key={`${user.email}-${user.role}`} className="align-top">
                      <td className="py-2 pr-4">{user.email}</td>
                      <td className="py-2 pr-4">{user.name ?? '—'}</td>
                      <td className="py-2 pr-4 capitalize">{user.role}</td>
                      <td className="py-2 pr-4">{formatDate(user.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Usage Stats</h2>
          {!detail.usage ? (
            <p className="mt-3 text-sm text-gray-400">No usage stats available for this tenant yet.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Tasks</p>
                <p className="mt-1 text-lg font-semibold text-white">{detail.usage.taskCount}</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Events</p>
                <p className="mt-1 text-lg font-semibold text-white">{detail.usage.eventCount}</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Total Tokens</p>
                <p className="mt-1 text-lg font-semibold text-white">{detail.usage.totalTokens.toLocaleString('en-US')}</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Total Cost (USD)</p>
                <p className="mt-1 text-lg font-semibold text-white">${detail.usage.totalCostUsd}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
