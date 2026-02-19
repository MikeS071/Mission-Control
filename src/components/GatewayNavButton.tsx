'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type GatewayConnection = { id: number };

export function GatewayNavButton() {
  const [label, setLabel] = useState('Gateways');

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/gateway', { cache: 'no-store' });
        if (!response.ok) return;
        const rows = (await response.json()) as GatewayConnection[];
        setLabel(rows.length === 0 ? 'Connect Gateway' : 'Gateways');
      } catch {
        // ignore and keep default
      }
    };
    void load();
  }, []);

  return (
    <Link href="/dashboard/connect" className="text-sm text-indigo-300 hover:text-indigo-200">
      {label}
    </Link>
  );
}
