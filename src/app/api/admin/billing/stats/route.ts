import { NextRequest, NextResponse } from 'next/server';
import { subscriptions } from '@/db/schema';
import { db } from '@/lib/db';
import { requireAdmin } from '@/app/api/admin/_auth';

export async function GET(_req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  const rows = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      seats: subscriptions.seats,
    })
    .from(subscriptions);

  const byPlan: Record<string, number> = {};
  let activeSubscriptions = 0;
  let totalSeats = 0;

  for (const row of rows) {
    byPlan[row.plan] = (byPlan[row.plan] ?? 0) + 1;
    if (row.status === 'active') activeSubscriptions += 1;
    totalSeats += row.seats ?? 0;
  }

  return NextResponse.json({
    totalTenantsWithSubscriptions: rows.length,
    activeSubscriptions,
    totalSeats,
    byPlan,
  });
}
