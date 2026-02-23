import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activityComments, activityEvents, tenants } from '@/db/schema';
import { broadcastFeedUpdate } from '@/lib/activity';
import { resolveTenantId } from '@/lib/tenant';

// ── GET /api/activity/comments?eventId=<uuid> ─────────────────────────────────
// Returns comments oldest-first, with commenter's tenant name.

const getQuery = z.object({
  eventId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = getQuery.safeParse({ eventId: req.nextUrl.searchParams.get('eventId') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
  }

  const { eventId } = parsed.data;

  const rows = await db
    .select({
      id:         activityComments.id,
      eventId:    activityComments.eventId,
      tenantId:   activityComments.tenantId,
      tenantName: tenants.name,
      body:       activityComments.body,
      createdAt:  activityComments.createdAt,
    })
    .from(activityComments)
    .innerJoin(tenants, eq(tenants.id, activityComments.tenantId))
    .where(sql`${activityComments.eventId} = ${eventId}::uuid`)
    .orderBy(asc(activityComments.createdAt));

  return NextResponse.json({ comments: rows });
}

// ── POST /api/activity/comments ───────────────────────────────────────────────
// Persists a comment and SSE-pushes activity.comment.created.

const postBody = z.object({
  eventId: z.string().uuid(),
  body:    z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = postBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const { eventId, body } = parsed.data;

  // Verify event exists
  const [event] = await db
    .select({ tenantId: activityEvents.tenantId })
    .from(activityEvents)
    .where(sql`${activityEvents.id} = ${eventId}::uuid`)
    .limit(1);

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Insert comment
  const [comment] = await db
    .insert(activityComments)
    .values({ eventId, tenantId, body })
    .returning();

  if (!comment) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });

  // Fetch tenant name for SSE payload
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const payload = {
    ...comment,
    tenantName: tenant?.name ?? 'Unknown',
  };

  // Broadcast to event owner's tenant (and commenter's if different)
  broadcastFeedUpdate(event.tenantId, 'activity.comment.created', payload);
  if (event.tenantId !== tenantId) {
    broadcastFeedUpdate(tenantId, 'activity.comment.created', payload);
  }

  return NextResponse.json({ ok: true, comment: payload }, { status: 201 });
}
