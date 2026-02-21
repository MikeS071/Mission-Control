import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { arenaStreaks } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { streakDaysToMultiplier } from '@/lib/arena';

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
      xp_multiplier: streakDaysToMultiplier(days),
      freeze_charges: row?.freezeCharges ?? 0,
      last_qualified_on: row?.lastQualifiedOn ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load streak' }, { status: 500 });
  }
}
