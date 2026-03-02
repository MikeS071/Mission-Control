import { tenants } from '@/db/schema';
import { db } from '@/lib/db';

type TenantPolicyListRow = {
  id: number;
  name: string;
  slug: string;
  plan: string;
};

const tierBadgeClassNames: Record<string, string> = {
  initiate: 'border-gray-700 bg-gray-900 text-gray-200',
  strategos: 'border-sky-700/70 bg-sky-900/30 text-sky-200',
  archon: 'border-amber-700/70 bg-amber-900/30 text-amber-200',
  free: 'border-gray-700 bg-gray-900 text-gray-200',
  pro: 'border-sky-700/70 bg-sky-900/30 text-sky-200',
  team: 'border-amber-700/70 bg-amber-900/30 text-amber-200',
};

function getTierBadgeClasses(plan: string) {
  return tierBadgeClassNames[plan] ?? 'border-gray-700 bg-gray-900 text-gray-200';
}

async function loadTenantPolicyRows(): Promise<TenantPolicyListRow[]> {
  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
    })
    .from(tenants)
    .orderBy(tenants.id);
}

export default async function AdminPoliciesPage() {
  let rows: TenantPolicyListRow[] = [];

  try {
    rows = await loadTenantPolicyRows();
  } catch (error) {
    console.error('Admin policies page query failed:', error);

    return (
      <main className="min-h-screen bg-gray-950 px-6 py-10 text-gray-100">
        <div className="mx-auto max-w-6xl rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          Failed to load tenant policies.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-10 text-gray-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">Tenant Policies</h1>
          <p className="mt-1 text-sm text-gray-400">Manage policy tiers and per-tenant rule overrides.</p>
        </header>

        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 shadow-[0_0_0_1px_rgba(31,41,55,0.25)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800 text-sm text-gray-200">
              <thead className="bg-gray-900/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Tenant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Slug</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-gray-800/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-100">{row.name}</p>
                        <p className="font-mono text-xs text-gray-500">ID {row.id}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">{row.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium capitalize ${getTierBadgeClasses(row.plan)}`}>
                          {row.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/admin/policies/${row.id}`} className="text-sky-300 transition hover:text-sky-200 hover:underline">
                          Edit policy
                        </a>
                      </td>
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
