import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { arenaChallenges, arenaStreaks } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { MILESTONES, streakDaysToMultiplier, xpToRank, isArchonEligible } from '@/lib/arena';

type MilestoneResponse = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  unlocked: boolean;
  unlockedAt: string | null;
};

const defaultSummary = {
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
  xpForNext: 100,
  levelPct: 0,
  streak: {
    current: 0,
    longest: 0,
    multiplier: 1,
    freezeCharges: 0,
  },
  milestones: MILESTONES.map((m) => ({
    id: m.id,
    label: m.label,
    icon: m.icon,
    desc: m.desc,
    unlocked: false,
    unlockedAt: null,
  })),
  totalTasksDone: 0,
  longestStreak: 0,
};

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let totalXp = 0;
  try {
    const xpResult = await db.execute(sql`
      SELECT COALESCE(SUM(reward_xp_awarded), 0)::int AS total_xp
      FROM arena_user_progress
      WHERE tenant_id = ${tenantId}
    `);
    totalXp = Number((xpResult.rows[0] as { total_xp?: number } | undefined)?.total_xp ?? 0);
  } catch {
    return NextResponse.json(defaultSummary);
  }

  let streak = defaultSummary.streak;
  try {
    const [streakRow] = await db
      .select({
        current: arenaStreaks.currentStreakDays,
        longest: arenaStreaks.longestStreakDays,
        freezeCharges: arenaStreaks.freezeCharges,
      })
      .from(arenaStreaks)
      .where(and(eq(arenaStreaks.tenantId, tenantId), eq(arenaStreaks.agentName, 'navi')))
      .limit(1);

    const current = streakRow?.current ?? 0;
    streak = {
      current,
      longest: streakRow?.longest ?? 0,
      multiplier: streakDaysToMultiplier(current),
      freezeCharges: streakRow?.freezeCharges ?? 0,
    };
  } catch {
    streak = defaultSummary.streak;
  }

  let totalTasksDone = 0;
  try {
    const tasksResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM tasks
      WHERE tenant_id = ${tenantId} AND status = 'done'
    `);
    totalTasksDone = Number((tasksResult.rows[0] as { total?: number } | undefined)?.total ?? 0);
  } catch {
    totalTasksDone = 0;
  }

  let deploysCount = 0;
  try {
    const deployResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM events
      WHERE tenant_id = ${tenantId} AND event_type = 'deploy'
    `);
    deploysCount = Number((deployResult.rows[0] as { total?: number } | undefined)?.total ?? 0);
  } catch {
    deploysCount = 0;
  }

  let costSavedCents = 0;
  try {
    const costResult = await db.execute(sql`
      SELECT COALESCE(SUM((source_snapshot->>'cost_saved_cents')::numeric), 0)::int AS total
      FROM arena_user_progress
      WHERE tenant_id = ${tenantId}
    `);
    costSavedCents = Number((costResult.rows[0] as { total?: number } | undefined)?.total ?? 0);
  } catch {
    costSavedCents = 0;
  }

  let unlockedDatesByKey = new Map<string, string>();
  try {
    const unlockResult = await db.execute(sql`
      SELECT c.challenge_key,
             MAX(COALESCE(p.claimed_at, p.completed_at))::text AS unlocked_at
      FROM arena_challenges c
      INNER JOIN arena_user_progress p
        ON p.challenge_id = c.id
       AND p.tenant_id = ${tenantId}
      WHERE c.tenant_id = ${tenantId}
      GROUP BY c.challenge_key
    `);

    unlockedDatesByKey = new Map(
      (unlockResult.rows as Array<{ challenge_key?: string; unlocked_at?: string | null }>)
        .filter((row) => Boolean(row.challenge_key) && Boolean(row.unlocked_at))
        .map((row) => [row.challenge_key as string, row.unlocked_at as string]),
    );
  } catch {
    unlockedDatesByKey = new Map<string, string>();
  }

  let arcsCompleted = 0;
  try {
    const arcsResult = await db.execute(sql`
      SELECT COUNT(DISTINCT p.id)::int AS total
      FROM arena_user_progress p
      JOIN arena_challenges c ON c.id = p.challenge_id
      WHERE p.tenant_id = ${tenantId}
        AND c.challenge_type = 'seasonal'
        AND p.status = 'claimed'
    `);
    arcsCompleted = Number((arcsResult.rows[0] as { total?: number } | undefined)?.total ?? 0);
  } catch {
    arcsCompleted = 0;
  }

  const rankState = xpToRank(totalXp, {
    longestStreak:  streak.longest,
    totalTasksDone,
    arcsCompleted,
  });

  const archonEligible = isArchonEligible({
    totalXp,
    longestStreak:  streak.longest,
    totalTasksDone,
    arcsCompleted,
  });

  const metrics = {
    total_tasks_done:  totalTasksDone,
    longest_streak:    streak.longest,
    deploys_count:     deploysCount,
    cost_saved_cents:  costSavedCents,
    arcs_completed:    arcsCompleted,
    total_xp:          totalXp,
  } as const;

  const milestones: MilestoneResponse[] = MILESTONES.map((m) => {
    const val = metrics[m.metric as keyof typeof metrics] ?? 0;
    const unlocked = m.id === 'archon' ? archonEligible : val >= m.threshold;
    return { id: m.id, label: m.label, icon: m.icon, desc: m.desc, unlocked, unlockedAt: unlockedDatesByKey.get(m.id) ?? null };
  });

  return NextResponse.json({
    totalXp,
    // Legacy level fields (kept for backwards compat)
    level:      rankState.rank.index,
    xpInLevel:  rankState.xpInRank,
    xpForNext:  rankState.xpForNext,
    levelPct:   rankState.pct,
    // Rank fields (new)
    rank: {
      id:          rankState.rank.id,
      label:       rankState.rank.label,
      tagline:     rankState.rank.tagline,
      color:       rankState.rank.color,
      isApex:      rankState.rank.isApex,
      archonReady: rankState.archonReady,
      archonGap:   rankState.archonGap,
    },
    streak,
    milestones,
    totalTasksDone,
    longestStreak:  streak.longest,
    arcsCompleted,
  });
}
