import { NextRequest, NextResponse } from 'next/server';
import { acknowledgeAlert } from '@/lib/usage/alerts';
import { resolveTenantId } from '@/lib/tenant';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId) || alertId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const alert = await acknowledgeAlert(tenantId, alertId);
  if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });

  return NextResponse.json({ alert });
}
