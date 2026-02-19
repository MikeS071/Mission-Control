import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

type EventInput = {
  taskId?: number | null;
  agentName?: string | null;
  eventType?: string;
  payload?: string;
};

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const limitParam = Number(searchParams.get('limit') || '50');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

  const base = db
    .select({
      id: events.id,
      taskId: events.taskId,
      agentName: events.agentName,
      eventType: events.eventType,
      payload: events.payload,
      createdAt: events.createdAt,
      taskTitle: tasks.title,
    })
    .from(events)
    .leftJoin(tasks, eq(events.taskId, tasks.id));

  const rows = taskId
    ? await base
        .where(and(eq(events.taskId, Number(taskId)), eq(events.tenantId, tenantId)))
        .orderBy(desc(events.createdAt))
        .limit(limit)
    : await base
        .where(eq(events.tenantId, tenantId))
        .orderBy(desc(events.createdAt))
        .limit(limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as EventInput;
  if (!body.eventType) {
    return NextResponse.json({ error: 'eventType is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(events)
    .values({
      tenantId,
      taskId: body.taskId ?? null,
      agentName: body.agentName ?? 'system',
      eventType: body.eventType,
      payload: body.payload ?? '',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
