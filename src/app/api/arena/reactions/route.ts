import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { arenaReactionCounters, arenaReactions } from '@/db/schema';
import {
  ARENA_REACTION_TYPES,
  emitArenaReactionCreated,
  enforceArenaReactionCooldown,
  enforceArenaReactionRateLimit,
} from '@/lib/arena-reactions';
import { resolveTenantId } from '@/lib/tenant';

const postBodySchema = z.object({
  toTenantId: z.number().int().positive(),
  reactionType: z.enum(ARENA_REACTION_TYPES),
});

const querySchema = z.object({
  toTenantId: z.coerce.number().int().positive(),
});

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({ toTenantId: req.nextUrl.searchParams.get('toTenantId') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid toTenantId' }, { status: 400 });
  }

  const { toTenantId } = parsed.data;

  const [counts] = await db
    .select({
      tribute: arenaReactionCounters.tributeCount,
      respect: arenaReactionCounters.respectCount,
      hype: arenaReactionCounters.hypeCount,
    })
    .from(arenaReactionCounters)
    .where(eq(arenaReactionCounters.toTenantId, toTenantId))
    .limit(1);

  return NextResponse.json({
    tribute: counts?.tribute ?? 0,
    respect: counts?.respect ?? 0,
    hype: counts?.hype ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const fromTenantId = await resolveTenantId(req);
  if (!fromTenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { toTenantId, reactionType } = parsed.data;

  if (fromTenantId === toTenantId) {
    return NextResponse.json({ error: 'Cannot react to yourself' }, { status: 400 });
  }

  const rateLimit = enforceArenaReactionRateLimit(fromTenantId);
  if (!rateLimit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } });
  }

  const cooldown = enforceArenaReactionCooldown(fromTenantId, toTenantId);
  if (!cooldown.ok) {
    return NextResponse.json({ error: 'Cooldown active' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(cooldown.retryAfterMs / 1000)) } });
  }

  await db.transaction(async (tx) => {
    await tx.insert(arenaReactions).values({
      fromTenantId,
      toTenantId,
      reactionType,
    });

    await tx
      .insert(arenaReactionCounters)
      .values({
        toTenantId,
        tributeCount: reactionType === 'tribute' ? 1 : 0,
        respectCount: reactionType === 'respect' ? 1 : 0,
        hypeCount: reactionType === 'hype' ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: arenaReactionCounters.toTenantId,
        set: {
          tributeCount: sql`${arenaReactionCounters.tributeCount} + ${reactionType === 'tribute' ? 1 : 0}`,
          respectCount: sql`${arenaReactionCounters.respectCount} + ${reactionType === 'respect' ? 1 : 0}`,
          hypeCount: sql`${arenaReactionCounters.hypeCount} + ${reactionType === 'hype' ? 1 : 0}`,
          updatedAt: new Date(),
        },
      });
  });

  const [counts] = await db
    .select({
      tribute: arenaReactionCounters.tributeCount,
      respect: arenaReactionCounters.respectCount,
      hype: arenaReactionCounters.hypeCount,
    })
    .from(arenaReactionCounters)
    .where(and(eq(arenaReactionCounters.toTenantId, toTenantId)))
    .limit(1);

  const normalizedCounts = {
    tribute: counts?.tribute ?? 0,
    respect: counts?.respect ?? 0,
    hype: counts?.hype ?? 0,
  };

  emitArenaReactionCreated({
    type: 'arena.reaction.created',
    toTenantId,
    fromTenantId,
    reactionType,
    counts: normalizedCounts,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, counts: normalizedCounts });
}
