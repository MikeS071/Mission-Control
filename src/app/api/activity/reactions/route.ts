import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activityEvents, activityReactions } from '@/db/schema';
import { broadcastFeedUpdate } from '@/lib/activity';
import { resolveTenantId } from '@/lib/tenant';

// ── Rate limit: 10 reactions per tenant per hour ──────────────────────────────

type Window = { count: number; windowStart: number };
const reactWindows = new Map<number, Window>();
const WINDOW_MS    = 60 * 60 * 1_000; // 1 hour
const MAX_PER_HOUR = 10;

function checkRateLimit(tenantId: number): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const win = reactWindows.get(tenantId);

  if (!win || now - win.windowStart > WINDOW_MS) {
    reactWindows.set(tenantId, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (win.count >= MAX_PER_HOUR) {
    return { ok: false, retryAfterMs: WINDOW_MS - (now - win.windowStart) };
  }
  win.count++;
  return { ok: true };
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const postBody = z.object({
  eventId:      z.string().uuid(),
  reactionType: z.enum(['hype', 'respect', 'tribute']),
});

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const fromTenantId = await resolveTenantId(req);
  if (!fromTenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { eventId, reactionType } = parsed.data;

  // Verify event exists and belongs to this tenant (no cross-tenant reaction for now)
  const [event] = await db
    .select({ tenantId: activityEvents.tenantId })
    .from(activityEvents)
    .where(sql`${activityEvents.id} = ${eventId}::uuid`)
    .limit(1);

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // No self-react
  if (event.tenantId === fromTenantId) {
    return NextResponse.json({ error: 'Cannot react to your own event' }, { status: 400 });
  }

  // Rate limit
  const rl = checkRateLimit(fromTenantId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  // Upsert — ignore if duplicate (same event+tenant+type)
  await db
    .insert(activityReactions)
    .values({ eventId, fromTenantId, reactionType })
    .onConflictDoNothing();

  // Return updated counts for this event
  const counts = await db
    .select({
      reactionType: activityReactions.reactionType,
      count:        sql<number>`COUNT(*)::int`,
    })
    .from(activityReactions)
    .where(sql`${activityReactions.eventId} = ${eventId}::uuid`)
    .groupBy(activityReactions.reactionType);

  const totals = { hype: 0, respect: 0, tribute: 0 };
  for (const row of counts) {
    if (row.reactionType === 'hype')    totals.hype    = row.count;
    if (row.reactionType === 'respect') totals.respect = row.count;
    if (row.reactionType === 'tribute') totals.tribute = row.count;
  }

  // SSE push to event owner's tenant
  broadcastFeedUpdate(event.tenantId, 'activity.reaction.updated', {
    eventId,
    fromTenantId,
    reactionType,
    counts: totals,
  });

  return NextResponse.json({ ok: true, counts: totals });
}
