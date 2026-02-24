import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activityComments, activityEvents, activityReactions } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

const querySchema = z.object({
  cursor: z.string().optional(),                         // ISO timestamp — exclusive upper bound
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({
    cursor: req.nextUrl.searchParams.get('cursor') ?? undefined,
    limit:  req.nextUrl.searchParams.get('limit')  ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params', issues: parsed.error.issues }, { status: 400 });
  }

  const { cursor, limit } = parsed.data;

  const whereClause = cursor
    ? and(eq(activityEvents.tenantId, tenantId), lt(activityEvents.createdAt, new Date(cursor)))
    : eq(activityEvents.tenantId, tenantId);

  const rows = await db
    .select()
    .from(activityEvents)
    .where(whereClause)
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit + 1); // fetch one extra to detect if there's a next page

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;

  // Attach per-event reaction counts in one query
  const eventIds = events.map((e) => e.id);
  const reactionCounts =
    eventIds.length > 0
      ? await db
          .select({
            eventId:      activityReactions.eventId,
            reactionType: activityReactions.reactionType,
            count:        sql<number>`COUNT(*)::int`,
          })
          .from(activityReactions)
          .where(sql`${activityReactions.eventId} = ANY(ARRAY[${sql.join(eventIds.map((id) => sql`${id}::uuid`), sql`, `)}])`)
          .groupBy(activityReactions.eventId, activityReactions.reactionType)
      : [];

  // Build counts map: eventId → { hype, respect, tribute }
  type ReactionCounts = { hype: number; respect: number; tribute: number };
  const countsMap = new Map<string, ReactionCounts>();
  for (const row of reactionCounts) {
    if (!countsMap.has(row.eventId)) {
      countsMap.set(row.eventId, { hype: 0, respect: 0, tribute: 0 });
    }
    const c = countsMap.get(row.eventId)!;
    if (row.reactionType === 'hype')    c.hype    = row.count;
    if (row.reactionType === 'respect') c.respect = row.count;
    if (row.reactionType === 'tribute') c.tribute = row.count;
  }

  // Attach per-event comment counts in one query
  const commentCounts =
    eventIds.length > 0
      ? await db
          .select({
            eventId: activityComments.eventId,
            count:   sql<number>`COUNT(*)::int`,
          })
          .from(activityComments)
          .where(sql`${activityComments.eventId} = ANY(ARRAY[${sql.join(eventIds.map((id) => sql`${id}::uuid`), sql`, `)}])`)
          .groupBy(activityComments.eventId)
      : [];

  const commentCountMap = new Map<string, number>();
  for (const row of commentCounts) {
    commentCountMap.set(row.eventId, row.count);
  }

  const enriched = events.map((e) => ({
    ...e,
    reactions: countsMap.get(e.id) ?? { hype: 0, respect: 0, tribute: 0 },
    commentCount: commentCountMap.get(e.id) ?? 0,
  }));

  return NextResponse.json({
    events:     enriched,
    nextCursor: hasMore ? events[events.length - 1]!.createdAt.toISOString() : null,
  });
}
