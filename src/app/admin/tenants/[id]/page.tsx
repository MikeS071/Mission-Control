import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
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

export type AdminTenantDetailData = {
  tenant: TenantRecord;
  users: TenantUserRecord[];
  usage: TenantUsageRecord;
};

function toPositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDate(value: Date | null): string {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(value);
}

export async function getAdminTenantDetailData(tenantIdParam: string): Promise<AdminTenantDetailData> {
  const session = await auth();
  if (!session) throw new Error('UNAUTHORIZED');
  if ((session as { tenantId?: number }).tenantId !== 1) throw new Error('FORBIDDEN');

  const tenantId = toPositiveInt(tenantIdParam);
  if (!tenantId) throw new Error('INVALID_TENANT_ID');

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

  if (!tenant) throw new Error('TENANT_NOT_FOUND');

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

  const taskCount = Number(usageRow?.task_count ?? 0);
  const eventCount = Number(usageRow?.event_count ?? 0);
  const totalTokens = Number(usageRow?.total_tokens ?? 0);
  const totalCostUsd = Number(usageRow?.total_cost_usd ?? 0);

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

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: AdminTenantDetailData;
  try {
    detail = await getAdminTenantDetailData(id);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'UNAUTHORIZED') redirect('/signin');
      if (error.message === 'FORBIDDEN') redirect('/dashboard');
      if (error.message === 'INVALID_TENANT_ID' || error.message === 'TENANT_NOT_FOUND') notFound();
    }
    throw error;
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
