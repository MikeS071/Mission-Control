import { NextRequest, NextResponse } from 'next/server';
import { subscriptions, tenants, users } from '@/db/schema';
import { db } from '@/lib/db';
import { requireAdmin } from '@/app/api/admin/_auth';

export async function GET(_req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  const [userRows, tenantRows, subscriptionRows] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: tenants.id }).from(tenants),
    db.select({ status: subscriptions.status }).from(subscriptions),
  ]);

  const activeSubscriptions = subscriptionRows.filter((row) => row.status === 'active').length;

  return NextResponse.json({
    users: userRows.length,
    tenants: tenantRows.length,
    activeSubscriptions,
  });
}
