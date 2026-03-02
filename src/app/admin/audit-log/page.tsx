import Link from 'next/link';
import { asc } from 'drizzle-orm';

import { tenants } from '@/db/schema';
import { db } from '@/lib/db';
import { listPolicyAuditLogs } from '@/lib/admin/audit-log';

type PageSearchParams = {
  tenantId?: string | string[];
  page?: string | string[];
  limit?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
}

function buildPageHref(page: number, limit: number, tenantId?: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));

  if (tenantId) {
    params.set('tenantId', String(tenantId));
  }

  return `/admin/audit-log?${params.toString()}`;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function formatTimestamp(timestamp: string): string {
  if (!timestamp) return 'Unknown';
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return 'Unknown';
  return `${timestampFormatter.format(value)} UTC`;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};

  const tenantId = parsePositiveInt(firstParam(resolvedParams.tenantId), 0) || undefined;
  const page = parsePositiveInt(firstParam(resolvedParams.page), 1);
  const limit = parsePositiveInt(firstParam(resolvedParams.limit), 20);

  const [tenantOptions, auditLog] = await Promise.all([
    db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .orderBy(asc(tenants.name)),
    listPolicyAuditLogs({ tenantId, page, limit }),
  ]);

  const hasPreviousPage = auditLog.page > 1;
  const hasNextPage = auditLog.page < auditLog.totalPages;

  return (
    <section className="space-y-6 text-gray-100">
      <header>
        <h1 className="text-2xl font-semibold text-white">Policy Audit Log</h1>
        <p className="mt-1 text-sm text-gray-400">All policy updates across tenants.</p>
      </header>

      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
          <label className="flex-1 text-sm text-gray-300" htmlFor="tenant-filter">
            Tenant
            <select
              id="tenant-filter"
              name="tenantId"
              defaultValue={tenantId ? String(tenantId) : ''}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none ring-sky-400/30 focus:ring"
            >
              <option value="">All tenants</option>
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="limit" value={auditLog.limit} />
          <button
            type="submit"
            className="rounded-md border border-sky-600 bg-sky-600/20 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-600/30"
          >
            Apply Filter
          </button>
          <Link
            href={buildPageHref(1, auditLog.limit)}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
          >
            Clear
          </Link>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800 text-sm text-gray-200">
            <thead className="bg-gray-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Changed By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Diff Summary</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-300">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {auditLog.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No policy changes found.
                  </td>
                </tr>
              ) : (
                auditLog.items.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-gray-800/40">
                    <td className="px-4 py-3 font-medium text-gray-100">{row.tenantName}</td>
                    <td className="px-4 py-3 text-gray-300">{row.changedBy}</td>
                    <td className="px-4 py-3 text-gray-300">{row.diffSummary}</td>
                    <td className="px-4 py-3 text-gray-300">{row.reason}</td>
                    <td className="px-4 py-3 text-gray-300">{formatTimestamp(row.timestamp)}</td>
                    <td className="px-4 py-3">
                      <details className="rounded-md border border-gray-700 bg-gray-900/60 p-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-sky-300">
                          View JSON Diff
                        </summary>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Old Rules</p>
                            <pre className="max-h-72 overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-200">
                              {prettyJson(row.oldRules)}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">New Rules</p>
                            <pre className="max-h-72 overflow-auto rounded-md bg-gray-950 p-3 text-xs text-gray-200">
                              {prettyJson(row.newRules)}
                            </pre>
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-400">
          Showing page {auditLog.page} of {auditLog.totalPages} ({auditLog.total} total entries)
        </p>
        <div className="flex items-center gap-2">
          {hasPreviousPage ? (
            <Link
              href={buildPageHref(auditLog.page - 1, auditLog.limit, tenantId)}
              className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-800"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded-md border border-gray-800 px-3 py-2 text-sm text-gray-500">Previous</span>
          )}

          {hasNextPage ? (
            <Link
              href={buildPageHref(auditLog.page + 1, auditLog.limit, tenantId)}
              className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-800"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-md border border-gray-800 px-3 py-2 text-sm text-gray-500">Next</span>
          )}
        </div>
      </div>
    </section>
  );
}
