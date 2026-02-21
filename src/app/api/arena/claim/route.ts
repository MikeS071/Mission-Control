import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { arenaChallenges, arenaUserProgress } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

type Body = { progressId?: number };

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await req.json()) as Body;
    const progressId = Number(body.progressId);
    if (!Number.isFinite(progressId)) return NextResponse.json({ error: 'Invalid progressId' }, { status: 400 });
    const [row] = await db.select({ progress: arenaUserProgress, rewardXp: arenaChallenges.rewardXp })
      .from(arenaUserProgress)
      .innerJoin(arenaChallenges, eq(arenaChallenges.id, arenaUserProgress.challengeId))
      .where(and(eq(arenaUserProgress.id, progressId), eq(arenaUserProgress.tenantId, tenantId))).limit(1);
    if (!row?.progress) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (row.progress.status === 'claimed') return NextResponse.json({ ok: true, xp_awarded: row.progress.rewardXpAwarded ?? 0 });
    if (row.progress.status !== 'completed') return NextResponse.json({ error: 'Challenge not completed' }, { status: 409 });
    const [updated] = await db.update(arenaUserProgress).set({
      status: 'claimed', claimedAt: new Date(), rewardXpAwarded: row.rewardXp, updatedAt: new Date(),
    }).where(and(eq(arenaUserProgress.id, progressId), eq(arenaUserProgress.tenantId, tenantId))).returning();
    return NextResponse.json({ ok: true, xp_awarded: updated.rewardXpAwarded ?? 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to claim challenge' }, { status: 500 });
  }
}
