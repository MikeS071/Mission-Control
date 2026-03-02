import { NextRequest, NextResponse } from 'next/server';
import { listUnacknowledgedAlerts } from '@/lib/usage/alerts';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const alerts = await listUnacknowledgedAlerts(tenantId);
  return NextResponse.json({ alerts });
}
