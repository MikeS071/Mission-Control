import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { challenges, streaks, tenants, xpLedger } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [totalRow] = await db
    .select({ totalXp: sql<number>`coalesce(sum(${xpLedger.points}), 0)` })
    .from(xpLedger)
    .where(eq(xpLedger.tenantId, tenantId));

  const [streakRow] = await db
    .select({ currentStreak: streaks.currentStreak, longestStreak: streaks.longestStreak })
    .from(streaks)
    .where(eq(streaks.tenantId, tenantId))
    .orderBy(sql`${streaks.updatedAt} desc`)
    .limit(1);

  const [activeChallengesRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(challenges)
    .where(sql`${challenges.tenantId} = ${tenantId} and ${challenges.status} = 'active'`);

  const rankResult = await db.execute(sql<{ rank: number }>`
    with totals as (
      select t.id as tenant_id, coalesce(sum(x.points), 0)::int as total_xp
      from ${tenants} t
      left join ${xpLedger} x on t.id = x.tenant_id
      group by t.id
    )
    select ranked.rank
    from (
      select tenant_id, dense_rank() over (order by total_xp desc) as rank
      from totals
    ) ranked
    where ranked.tenant_id = ${tenantId}
    limit 1
  `);

  const totalXp = Number(totalRow?.totalXp ?? 0);
  const rank = Number(rankResult.rows[0]?.rank ?? 1);

  return NextResponse.json({
    totalXp,
    level: Math.floor(totalXp / 100) + 1,
    currentStreak: Number(streakRow?.currentStreak ?? 0),
    longestStreak: Number(streakRow?.longestStreak ?? 0),
    rank,
    activeChallenges: Number(activeChallengesRow?.count ?? 0),
  });
}
