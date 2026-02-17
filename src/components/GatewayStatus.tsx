'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GatewayStatus() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch('/api/gateway/status').then(r => r.json()).then(setData).catch(() => setData({ error: 'unreachable' }));
  }, []);
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader><CardTitle>Gateway Status</CardTitle></CardHeader>
      <CardContent><pre className="text-xs text-green-400 overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre></CardContent>
    </Card>
  );
}
