import { eq } from 'drizzle-orm';
import { memberships, tenants, users } from '@/db/schema';
import { db } from '@/lib/db';

type AdminUserRow = {
  id: number;
  email: string;
  tenantName: string | null;
  createdAt: Date | null;
  lastLogin: Date | null;
};

function formatTimestamp(value: Date | null): string {
  if (!value) {
    return '—';
  }

  return value.toISOString().slice(0, 10);
}

async function loadUsers(): Promise<AdminUserRow[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      tenantName: tenants.name,
      createdAt: users.createdAt,
      lastLogin: users.updatedAt,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userEmail, users.email))
    .leftJoin(tenants, eq(tenants.id, memberships.tenantId))
    .orderBy(users.id);
}

export default async function AdminUsersPage() {
  let rows: AdminUserRow[] = [];

  try {
    rows = await loadUsers();
  } catch (error) {
    console.error('Admin users page query failed:', error);

    return (
      <section className="space-y-4 text-slate-100">
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          Failed to load users.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 text-slate-100">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Users</h1>
        <p className="mt-1 text-sm text-slate-400">All users across tenants.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Tenant</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={5}>
                  No users found
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.id}-${row.tenantName ?? 'no-tenant'}`} className="hover:bg-slate-900/60">
                  <td className="whitespace-nowrap px-4 py-3">{row.id}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.email}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.tenantName ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatTimestamp(row.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatTimestamp(row.lastLogin)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
