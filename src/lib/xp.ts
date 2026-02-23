import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { challenges, streaks, xpLedger } from '@/db/schema';
import { xpToRank } from '@/lib/arena';
import { emitEvent } from '@/lib/activity';

export const XP_RULES = {
  TASK_CREATED: 2,
  TASK_COMPLETED: 10,
  STREAK_BONUS: 5,
} as const;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

const STREAK_MILESTONES = new Set([7, 30, 100]);

export async function awardXp(tenantId: number, points: number, reason: string, refId?: string) {
  try {
    // Capture XP before insert to detect rank-up
    const xpBefore = await getTenantTotalXp(tenantId);
    const rankBefore = xpToRank(xpBefore);

    await db.insert(xpLedger).values({
      tenantId,
      userEmail: 'system',
      points,
      reason,
      refId: refId ?? null,
    });

    // Emit xp_rank_up if rank threshold crossed
    const rankAfter = xpToRank(xpBefore + points);
    if (rankAfter.rank.id !== rankBefore.rank.id) {
      void emitEvent(tenantId, 'xp_rank_up', {
        agentName: 'system',
        oldRank:   rankBefore.rank.label,
        newRank:   rankAfter.rank.label,
      });
    }

    const today = utcDay();
    const [existing] = await db
      .select()
      .from(streaks)
      .where(and(eq(streaks.tenantId, tenantId), eq(streaks.userEmail, 'system')))
      .limit(1);

    if (!existing) {
      await db.insert(streaks).values({
        tenantId,
        userEmail: 'system',
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        updatedAt: new Date(),
      });

      await db.insert(xpLedger).values({
        tenantId,
        userEmail: 'system',
        points: XP_RULES.STREAK_BONUS,
        reason: 'streak_bonus',
        refId: today,
      });
      return;
    }

    if (existing.lastActivityDate === today) {
      return;
    }

    let nextCurrent = 1;
    if (existing.lastActivityDate) {
      const last = parseUtcDay(existing.lastActivityDate).getTime();
      const now = parseUtcDay(today).getTime();
      const daysDelta = Math.round((now - last) / ONE_DAY_MS);
      nextCurrent = daysDelta === 1 ? existing.currentStreak + 1 : 1;
    }

    const nextLongest = Math.max(existing.longestStreak, nextCurrent);

    await db
      .update(streaks)
      .set({
        currentStreak: nextCurrent,
        longestStreak: nextLongest,
        lastActivityDate: today,
        updatedAt: new Date(),
      })
      .where(eq(streaks.id, existing.id));

    await db.insert(xpLedger).values({
      tenantId,
      userEmail: 'system',
      points: XP_RULES.STREAK_BONUS,
      reason: 'streak_bonus',
      refId: today,
    });

    // Emit streak_milestone at 7, 30, 100 days
    if (STREAK_MILESTONES.has(nextCurrent)) {
      void emitEvent(tenantId, 'streak_milestone', {
        agentName: 'system',
        days: nextCurrent,
      });
    }
  } catch {
    // fire-and-forget helper by design
  }
}

export async function getTenantTotalXp(tenantId: number): Promise<number> {
  const [result] = await db
    .select({ totalXp: sql<number>`coalesce(sum(${xpLedger.points}), 0)` })
    .from(xpLedger)
    .where(eq(xpLedger.tenantId, tenantId));

  return Number(result?.totalXp ?? 0);
}

export async function getChallengeById(tenantId: number, challengeId: number) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, challengeId), eq(challenges.tenantId, tenantId)))
    .limit(1);

  return challenge ?? null;
}
