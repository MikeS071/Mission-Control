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

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">VPS Provisioning</h2>
        <Button onClick={loadInstances} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">No provisioned instances yet.</p>
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
              {instances.map((instance) => (
                <tr key={instance.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-3">
                    {instance.tenantId}
                    {instance.isTrial && (
                      <span className="ml-2 text-xs text-orange-500">(Trial)</span>
                    )}
                  </td>
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
  );
}
