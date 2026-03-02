import { sql } from 'drizzle-orm';

import { memberships, tenants } from '@/db/schema';
import { db } from '@/lib/db';

type TenantListRow = {
  id: number;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date | null;
  userCount: number;
};

const createdDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

async function loadTenants(): Promise<TenantListRow[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
      userCount: sql<number | string>`(
        select count(distinct ${memberships.userEmail})::int
        from ${memberships}
        where ${memberships.tenantId} = ${tenants.id}
      )`,
    })
    .from(tenants)
    .orderBy(tenants.createdAt);

  return rows.map((row) => ({
    ...row,
    userCount: Number(row.userCount) || 0,
  }));
}

function formatCreatedDate(createdAt: Date | null) {
  if (!createdAt) {
    return 'Not set';
  }

  return createdDateFormatter.format(createdAt);
}

export default async function AdminTenantsPage() {
  let tenantRows: TenantListRow[] = [];

  try {
    tenantRows = await loadTenants();
  } catch (error) {
    console.error('Admin tenants page query failed:', error);

    return (
      <main className="min-h-screen bg-gray-950 px-6 py-10 text-gray-100">
        <div className="mx-auto max-w-6xl rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          Failed to load tenants.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-10 text-gray-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">Tenants</h1>
          <p className="mt-1 text-sm text-gray-400">Admin view of all tenant workspaces.</p>
        </header>

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 shadow-[0_0_0_1px_rgba(31,41,55,0.25)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-sm text-gray-200">
              <thead className="bg-gray-900/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Slug</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">User Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {tenantRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  tenantRows.map((tenant) => (
                    <tr key={tenant.id} className="transition-colors hover:bg-gray-800/40">
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">{tenant.id}</td>
                      <td className="px-4 py-3">
                        <a href={`/admin/tenants/${tenant.id}`} className="font-medium text-sky-300 hover:text-sky-200 hover:underline">
                          {tenant.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">{tenant.slug}</td>
                      <td className="px-4 py-3 capitalize text-gray-200">{tenant.plan}</td>
                      <td className="px-4 py-3 text-gray-300">{formatCreatedDate(tenant.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-gray-100">{tenant.userCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
