import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';

type EventInput = {
  taskId?: number | null;
  agentName?: string | null;
  eventType?: string;
  payload?: string;
};

export async function GET(req: NextRequest) {
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
    ? await base.where(eq(events.taskId, Number(taskId))).orderBy(desc(events.createdAt)).limit(limit)
    : await base.orderBy(desc(events.createdAt)).limit(limit);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as EventInput;
  if (!body.eventType) {
    return NextResponse.json({ error: 'eventType is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(events)
    .values({
      taskId: body.taskId ?? null,
      agentName: body.agentName ?? 'system',
      eventType: body.eventType,
      payload: body.payload ?? '',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
