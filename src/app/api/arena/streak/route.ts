import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { arenaStreaks } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

const xpMultiplier = (days: number) => {
  if (days >= 100) return 1.6;
  if (days >= 60) return 1.5;
  if (days >= 30) return 1.35;
  if (days >= 14) return 1.2;
  if (days >= 7) return 1.1;
  if (days >= 3) return 1.05;
  return 1;
};

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [row] = await db.select().from(arenaStreaks)
      .where(and(eq(arenaStreaks.tenantId, tenantId), eq(arenaStreaks.agentName, 'navi'))).limit(1);
    const days = row?.currentStreakDays ?? 0;
    return NextResponse.json({
      current_streak_days: days,
      longest_streak_days: row?.longestStreakDays ?? 0,
      xp_multiplier: xpMultiplier(days),
      freeze_charges: row?.freezeCharges ?? 0,
      last_qualified_on: row?.lastQualifiedOn ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load streak' }, { status: 500 });
  }
}
