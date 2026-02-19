import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { getTenantSubscription } from '@/lib/billing';

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await getTenantSubscription(tenantId);

  return NextResponse.json({
    tenantId,
    plan: subscription.plan,
    status: subscription.status,
    seats: subscription.seats,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
}
