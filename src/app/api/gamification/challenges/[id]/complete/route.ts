import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { challenges } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';
import { awardXp } from '@/lib/xp';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const challengeId = Number(id);
  if (!Number.isFinite(challengeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, challengeId), eq(challenges.tenantId, tenantId)))
    .limit(1);

  if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  if (challenge.status === 'completed') return NextResponse.json(challenge);

  const [updated] = await db
    .update(challenges)
    .set({
      status: 'completed',
      completedAt: new Date(),
    })
    .where(and(eq(challenges.id, challengeId), eq(challenges.tenantId, tenantId)))
    .returning();

  void awardXp(tenantId, updated.xpReward, 'challenge_won', String(updated.id));

  return NextResponse.json(updated);
}
