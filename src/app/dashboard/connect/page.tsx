'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CheckResponse = {
  check?: {
    status?: 'ok' | 'error';
    info?: unknown;
  };
};

export default function ConnectGatewayPage() {
  const router = useRouter();
  const [label, setLabel] = useState('My Gateway');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'ok' | 'error' | null>(null);
  const [testInfo, setTestInfo] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const onTestConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url.trim(), {
        method: 'GET',
        headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {},
      });

      let info: unknown = null;
      try {
        info = await response.json();
      } catch {
        info = null;
      }

      const status = response.ok ? 'ok' : 'error';
      setTestStatus(status);
      setTestInfo(info);
      setStep(2);
    } catch {
      setTestStatus('error');
      setTestInfo(null);
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim() || 'My Gateway',
          url: url.trim(),
          token: token.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({ error: 'Failed to save connection' }))) as {
          error?: string;
        };
        setError(payload.error ?? 'Failed to save connection');
        return;
      }

      const payload = (await response.json()) as CheckResponse;
      setTestStatus(payload.check?.status ?? null);
      setTestInfo(payload.check?.info ?? null);
      setStep(3);
      setTimeout(() => {
        router.push('/dashboard');
      }, 900);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Connect OpenClaw Gateway</h1>
          <Link href="/dashboard" className="text-sm text-indigo-300 hover:text-indigo-200">
            Back to dashboard
          </Link>
        </div>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>Step 1 — Gateway details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Connection label"
            />
            <input
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:18789"
            />
            <input
              className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Optional bearer token"
              type="password"
            />
            <Button disabled={loading || !url.trim()} onClick={onTestConnection}>
              {loading ? 'Testing...' : 'Test Connection'}
            </Button>
          </CardContent>
        </Card>

        {step >= 2 && (
          <Card className="border-gray-800 bg-gray-900">
            <CardHeader>
              <CardTitle>Step 2 — Connection result</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={testStatus === 'ok' ? 'text-green-400' : 'text-red-400'}>
                {testStatus === 'ok' ? '✅ Gateway reachable' : '❌ Gateway unreachable'}
              </div>
              {testInfo !== null && (
                <pre className="max-h-56 overflow-auto rounded bg-black/30 p-2 text-xs text-gray-300">
                  {JSON.stringify(testInfo, null, 2)}
                </pre>
              )}
              <Button disabled={loading || testStatus !== 'ok'} onClick={onConfirm}>
                {loading ? 'Saving...' : 'Confirm & Save'}
              </Button>
              {error && <div className="text-sm text-red-400">{error}</div>}
            </CardContent>
          </Card>
        )}

        {step >= 3 && (
          <Card className="border-gray-800 bg-gray-900">
            <CardHeader>
              <CardTitle>Step 3 — Done</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-400">Gateway connected. Redirecting to dashboard...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
