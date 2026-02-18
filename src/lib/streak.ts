import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { streaks } from '@/db/schema';
import { awardXp, XP_RULES } from '@/lib/xp';

type StreakResult = {
  currentStreak: number;
  longestStreak: number;
  awardedBonus: boolean;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

export async function updateStreakForActivity(tenantId: number, userEmail: string): Promise<StreakResult> {
  const today = utcDay();

  const [existing] = await db
    .select()
    .from(streaks)
    .where(and(eq(streaks.tenantId, tenantId), eq(streaks.userEmail, userEmail)))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(streaks)
      .values({
        tenantId,
        userEmail,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        updatedAt: new Date(),
      })
      .returning();

    await awardXp(tenantId, XP_RULES.STREAK_BONUS, 'streak_bonus', today);

    return { currentStreak: created.currentStreak, longestStreak: created.longestStreak, awardedBonus: true };
  }

  if (existing.lastActivityDate === today) {
    return {
      currentStreak: existing.currentStreak,
      longestStreak: existing.longestStreak,
      awardedBonus: false,
    };
  }

  let nextCurrent = 1;
  if (existing.lastActivityDate) {
    const last = parseUtcDay(existing.lastActivityDate).getTime();
    const now = parseUtcDay(today).getTime();
    const daysDelta = Math.round((now - last) / ONE_DAY_MS);
    nextCurrent = daysDelta === 1 ? existing.currentStreak + 1 : 1;
  }

  const nextLongest = Math.max(existing.longestStreak, nextCurrent);

  const [updated] = await db
    .update(streaks)
    .set({
      currentStreak: nextCurrent,
      longestStreak: nextLongest,
      lastActivityDate: today,
      updatedAt: new Date(),
    })
    .where(eq(streaks.id, existing.id))
    .returning();

  await awardXp(tenantId, XP_RULES.STREAK_BONUS, 'streak_bonus', today);

  return {
    currentStreak: updated.currentStreak,
    longestStreak: updated.longestStreak,
    awardedBonus: true,
  };
}
