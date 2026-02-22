'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type ProvisionedInstance = {
  id: number;
  tenantId: number;
  dropletId: number | null;
  dropletIp: string | null;
  status: 'pending' | 'creating' | 'configuring' | 'ready' | 'failed';
  errorMessage: string | null;
  plan: string;
  isTrial: boolean;
  ttlExpiresAt: string | null;
  createdAt: string;
  tenantEmail?: string;
  tenantName?: string;
};

const statusColors = {
  pending: 'bg-yellow-500',
  creating: 'bg-blue-500 animate-pulse',
  configuring: 'bg-blue-500 animate-pulse',
  ready: 'bg-green-500',
  failed: 'bg-red-500',
};

export function ProvisioningPanel() {
  const [instances, setInstances] = useState<ProvisionedInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tester provisioning form state
  const [trialEmail, setTrialEmail] = useState('');
  const [trialPlan, setTrialPlan] = useState<'strategos' | 'archon'>('strategos');
  const [trialTtl, setTrialTtl] = useState(4);
  const [provisioning, setProvisioning] = useState(false);

  const loadInstances = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/provision/list', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load instances: ${res.status}`);
      }
      const data = await res.json();
      setInstances(data.instances || []);
      setError(null);
    } catch (err) {
      console.error('Error loading instances:', err);
      setError(err instanceof Error ? err.message : 'Failed to load instances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInstances();
    const interval = setInterval(loadInstances, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [loadInstances]);

  const handleCheckStatus = async (instanceId: number) => {
    try {
      const res = await fetch(`/api/admin/provision/${instanceId}/status`);
      if (res.ok) {
        await loadInstances();
      }
    } catch (err) {
      console.error('Error checking status:', err);
    }
  };

  const handleRetrigger = async (tenantId: number, plan: string) => {
    try {
      const res = await fetch('/api/admin/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, plan }),
      });

      if (!res.ok) {
        throw new Error('Failed to re-trigger provisioning');
      }

      await loadInstances();
    } catch (err) {
      console.error('Error re-triggering:', err);
      alert('Failed to re-trigger provisioning');
    }
  };

  const handleProvisionTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trialEmail.trim()) {
      alert('Please enter a tenant email');
      return;
    }

    setProvisioning(true);
    try {
      const res = await fetch('/api/admin/provision/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantEmail: trialEmail.trim(),
          plan: trialPlan,
          ttlHours: trialTtl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to provision trial');
      }

      alert('Trial instance provisioning started!');
      setTrialEmail('');
      await loadInstances();
    } catch (err) {
      console.error('Error provisioning trial:', err);
      alert(err instanceof Error ? err.message : 'Failed to provision trial');
    } finally {
      setProvisioning(false);
    }
  };

  const handleRevokeTrial = async (instanceId: number, dropletId: number | null) => {
    if (!confirm('Are you sure you want to revoke this trial instance?')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/provision/trial/${instanceId}/revoke`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to revoke trial');
      }

      alert('Trial instance revoked successfully');
      await loadInstances();
    } catch (err) {
      console.error('Error revoking trial:', err);
      alert('Failed to revoke trial');
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">VPS Provisioning</h2>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">VPS Provisioning</h2>
        <p className="text-sm text-red-500">{error}</p>
        <Button onClick={loadInstances} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const trialInstances = instances.filter((i) => i.isTrial);
  const productionInstances = instances.filter((i) => !i.isTrial);

  const calculateTimeLeft = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Permanent';
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Tester Instances Section */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Tester Trial Instances</h2>

        <form onSubmit={handleProvisionTrial} className="mb-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">Tenant Email</label>
              <input
                type="email"
                value={trialEmail}
                onChange={(e) => setTrialEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Plan</label>
              <select
                value={trialPlan}
                onChange={(e) => setTrialPlan(e.target.value as 'strategos' | 'archon')}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="strategos">Strategos (2GB)</option>
                <option value="archon">Archon (4GB)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">TTL</label>
              <select
                value={trialTtl}
                onChange={(e) => setTrialTtl(Number(e.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value={1}>1 hour</option>
                <option value={4}>4 hours</option>
                <option value={24}>24 hours</option>
                <option value={0}>Permanent</option>
              </select>
            </div>
          </div>
          <Button type="submit" disabled={provisioning}>
            {provisioning ? 'Provisioning...' : 'Provision Trial Instance'}
          </Button>
        </form>

        {trialInstances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trial instances.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Plan</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">VPS IP</th>
                  <th className="px-4 py-2 text-left">TTL</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {trialInstances.map((instance) => (
                  <tr key={instance.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3">{instance.tenantEmail || 'N/A'}</td>
                    <td className="px-4 py-3 capitalize">{instance.plan}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium text-white ${
                          statusColors[instance.status]
                        }`}
                      >
                        {instance.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {instance.dropletIp || <span className="text-muted-foreground">Pending...</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={instance.ttlExpiresAt && new Date(instance.ttlExpiresAt).getTime() < Date.now() ? 'text-red-500' : ''}>
                        {calculateTimeLeft(instance.ttlExpiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        onClick={() => handleRevokeTrial(instance.id, instance.dropletId)}
                        variant="destructive"
                        size="sm"
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Production Instances Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Production VPS Instances</h2>
          <Button onClick={loadInstances} variant="outline" size="sm">
            Refresh
          </Button>
        </div>

        {productionInstances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No production instances yet.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Tenant ID</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">VPS IP</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productionInstances.map((instance) => (
                <tr key={instance.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">{instance.tenantId}</td>
                  <td className="px-4 py-3">{instance.tenantEmail || 'N/A'}</td>
                  <td className="px-4 py-3 capitalize">{instance.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-medium text-white ${
                        statusColors[instance.status]
                      }`}
                    >
                      {instance.status}
                    </span>
                    {instance.errorMessage && (
                      <p className="mt-1 text-xs text-red-500">{instance.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {instance.dropletIp || (
                      <span className="text-muted-foreground">Pending...</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(instance.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleCheckStatus(instance.id)}
                        variant="outline"
                        size="sm"
                      >
                        Check
                      </Button>
                      {instance.status === 'failed' && (
                        <Button
                          onClick={() => handleRetrigger(instance.tenantId, instance.plan)}
                          variant="outline"
                          size="sm"
                        >
                          Re-trigger
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
