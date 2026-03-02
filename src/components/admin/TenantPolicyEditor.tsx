'use client';

import { useCallback, useMemo, useState } from 'react';

export type PolicyRuleValue = boolean | number;

export type TenantPolicyPayload = {
  tier: string;
  rules: Record<string, PolicyRuleValue>;
  overrides?: Record<string, boolean>;
};

export type PolicyAuditEntry = {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
};

export type TenantPolicyResponse = {
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
  tier: string;
  rules: Record<string, PolicyRuleValue>;
  overrides: Record<string, boolean>;
  auditLog: PolicyAuditEntry[];
};

type TenantPolicyEditorProps = {
  tenantId: number;
  initialData?: TenantPolicyResponse | null;
};

function toPolicyResponse(raw: unknown, tenantId: number): TenantPolicyResponse {
  const data = (raw ?? {}) as {
    tenant?: { id?: number; name?: string; slug?: string };
    tier?: string;
    rules?: Record<string, unknown>;
    overrides?: Record<string, unknown>;
    auditLog?: Array<{
      id?: string | number;
      action?: string;
      actor?: string;
      createdAt?: string;
    }>;
  };

  const rules: Record<string, PolicyRuleValue> = {};
  for (const [key, value] of Object.entries(data.rules ?? {})) {
    if (typeof value === 'boolean' || typeof value === 'number') {
      rules[key] = value;
    }
  }

  const overrides: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(data.overrides ?? {})) {
    if (typeof value === 'boolean') {
      overrides[key] = value;
    }
  }

  const auditLog: PolicyAuditEntry[] = Array.isArray(data.auditLog)
    ? data.auditLog.map((entry, index) => ({
        id: String(entry.id ?? `audit-${index}`),
        action: entry.action ?? 'policy.updated',
        actor: entry.actor ?? 'system',
        createdAt: entry.createdAt ?? new Date(0).toISOString(),
      }))
    : [];

  return {
    tenant: {
      id: data.tenant?.id ?? tenantId,
      name: data.tenant?.name ?? `Tenant ${tenantId}`,
      slug: data.tenant?.slug ?? `tenant-${tenantId}`,
    },
    tier: data.tier ?? 'initiate',
    rules,
    overrides,
    auditLog,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string') {
      return payload.error;
    }
  } catch {
    // Ignore payload parse errors and use status fallback below.
  }

  return `Request failed (${response.status})`;
}

export async function fetchTenantPolicy(
  tenantId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TenantPolicyResponse> {
  const response = await fetchImpl(`/api/admin/policy/${tenantId}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return toPolicyResponse(await response.json(), tenantId);
}

export async function saveTenantPolicy(
  tenantId: number,
  payload: TenantPolicyPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<TenantPolicyResponse> {
  const response = await fetchImpl(`/api/admin/policy/${tenantId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return toPolicyResponse(await response.json(), tenantId);
}

export async function resetTenantPolicy(
  tenantId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TenantPolicyResponse> {
  const response = await fetchImpl(`/api/admin/policy/${tenantId}/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return toPolicyResponse(await response.json(), tenantId);
}

function formatAuditDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().replace('T', ' ').slice(0, 16);
}

export function TenantPolicyEditor({ tenantId, initialData = null }: TenantPolicyEditorProps) {
  const [policy, setPolicy] = useState<TenantPolicyResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [tier, setTier] = useState(initialData?.tier ?? 'initiate');
  const [rules, setRules] = useState<Record<string, PolicyRuleValue>>(initialData?.rules ?? {});
  const [overrides, setOverrides] = useState<Record<string, boolean>>(initialData?.overrides ?? {});

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await fetchTenantPolicy(tenantId);
      setPolicy(next);
      setTier(next.tier);
      setRules(next.rules);
      setOverrides(next.overrides);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const ruleKeys = useMemo(() => Object.keys(rules).sort(), [rules]);

  const save = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const next = await saveTenantPolicy(tenantId, { tier, rules, overrides });
      setPolicy(next);
      setTier(next.tier);
      setRules(next.rules);
      setOverrides(next.overrides);
      setNotice('Policy saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  }, [overrides, rules, tenantId, tier]);

  const reset = useCallback(async () => {
    setResetting(true);
    setNotice(null);
    setError(null);
    try {
      const next = await resetTenantPolicy(tenantId);
      setPolicy(next);
      setTier(next.tier);
      setRules(next.rules);
      setOverrides(next.overrides);
      setNotice('Policy reset to defaults.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to reset policy');
    } finally {
      setResetting(false);
    }
  }, [tenantId]);

  if (loading && !policy) {
    return (
      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-300">
        Loading policy...
      </section>
    );
  }

  if (!policy) {
    return (
      <section className="space-y-4 rounded-xl border border-red-900/70 bg-red-950/20 p-4 text-sm text-red-100">
        <p>{error ?? 'Policy was not found.'}</p>
        <button
          type="button"
          onClick={loadPolicy}
          className="rounded-md border border-red-700/70 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-900/40"
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-xl border border-gray-800 bg-gray-900/55 p-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-white">Policy Editor</h2>
        <p className="text-sm text-gray-400">
          Tenant: <span className="font-medium text-gray-100">{policy.tenant.name}</span> ({policy.tenant.slug})
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <label htmlFor="policy-tier" className="text-sm font-medium text-gray-300">
          Current Tier
        </label>
        <select
          id="policy-tier"
          value={tier}
          onChange={(event) => setTier(event.target.value)}
          className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none ring-0 focus:border-sky-500"
        >
          {['initiate', 'strategos', 'archon'].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Rules</h3>
        {ruleKeys.length === 0 ? (
          <p className="text-sm text-gray-400">No rules available.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="min-w-full divide-y divide-gray-800 text-sm">
              <thead className="bg-gray-900/90 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Rule</th>
                  <th className="px-3 py-2 text-left font-medium">Value</th>
                  <th className="px-3 py-2 text-left font-medium">Custom Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-100">
                {ruleKeys.map((ruleKey) => {
                  const ruleValue = rules[ruleKey];
                  const isBooleanRule = typeof ruleValue === 'boolean';

                  return (
                    <tr key={ruleKey}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-300">{ruleKey}</td>
                      <td className="px-3 py-2">
                        {isBooleanRule ? (
                          <input
                            type="checkbox"
                            checked={Boolean(ruleValue)}
                            onChange={(event) =>
                              setRules((prev) => ({
                                ...prev,
                                [ruleKey]: event.target.checked,
                              }))
                            }
                          />
                        ) : (
                          <input
                            type="number"
                            value={Number(ruleValue)}
                            onChange={(event) =>
                              setRules((prev) => ({
                                ...prev,
                                [ruleKey]: Number(event.target.value),
                              }))
                            }
                            className="w-28 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-gray-100"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(overrides[ruleKey])}
                          onChange={(event) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [ruleKey]: event.target.checked,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="rounded border border-red-900/70 bg-red-950/25 px-3 py-2 text-sm text-red-100">{error}</p>}
      {notice && <p className="rounded border border-emerald-900/70 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100">{notice}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || resetting}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Policy'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving || resetting}
          className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-100 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetting ? 'Resetting...' : 'Reset to Defaults'}
        </button>
        <button
          type="button"
          onClick={loadPolicy}
          disabled={saving || resetting || loading}
          className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reload
        </button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Audit Log</h3>
        {policy.auditLog.length === 0 ? (
          <p className="text-sm text-gray-400">No audit history yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="min-w-full divide-y divide-gray-800 text-sm">
              <thead className="bg-gray-900/80 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-left font-medium">Actor</th>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-200">
                {policy.auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                    <td className="px-3 py-2">{entry.actor}</td>
                    <td className="px-3 py-2 text-gray-400">{formatAuditDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
