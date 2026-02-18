import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';

type TaskInput = {
  id?: number;
  title?: string;
  description?: string;
  goal?: string;
  priority?: string;
  status?: string;
  tags?: string;
  assignedAgent?: string | null;
  assigned_agent?: string | null;
};

const normalizeStatus = (status?: string) => {
  const value = (status || '').toLowerCase();
  if (['in progress', 'in_progress', 'assigned', 'review'].includes(value)) return 'in_progress';
  if (['done', 'complete', 'completed'].includes(value)) return 'done';
  return 'todo';
};

const normalizePriority = (priority?: string) => {
  const value = (priority || '').toLowerCase();
  if (value === 'low') return 'Low';
  if (value === 'high') return 'High';
  if (value === 'critical') return 'Critical';
  return 'Medium';
};

function mapInput(body: TaskInput) {
  return {
    title: body.title?.trim() || 'Untitled Task',
    description: body.description || '',
    goal: body.goal || 'Goal 1',
    priority: normalizePriority(body.priority),
    status: normalizeStatus(body.status),
    assignedAgent: body.assignedAgent ?? body.assigned_agent ?? null,
    tags: body.tags || '',
    updatedAt: new Date(),
  };
}

function mapPatch(body: TaskInput) {
  const updates: Record<string, string | Date | null> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim() || 'Untitled Task';
  if (body.description !== undefined) updates.description = body.description;
  if (body.goal !== undefined) updates.goal = body.goal;
  if (body.priority !== undefined) updates.priority = normalizePriority(body.priority);
  if (body.status !== undefined) updates.status = normalizeStatus(body.status);
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.assignedAgent !== undefined || body.assigned_agent !== undefined) {
    updates.assignedAgent = body.assignedAgent ?? body.assigned_agent ?? null;
  }
  return updates;
}

export async function GET() {
  const all = await db.select().from(tasks).orderBy(tasks.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaskInput;
  const [task] = await db.insert(tasks).values(mapInput(body)).returning();

  if (task) {
    await db.insert(events).values({
      taskId: task.id,
      agentName: 'system',
      eventType: 'created',
      payload: `Task created: ${task.title}`,
    });
  }

  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as TaskInput;
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!before) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const updates = mapPatch(data);
  const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();

  if (task) {
    const changedFields: Record<string, string | null> = {};
    if (data.title !== undefined && task.title !== before.title) changedFields.title = task.title;
    if (data.description !== undefined && task.description !== before.description) changedFields.description = task.description;
    if (data.goal !== undefined && task.goal !== before.goal) changedFields.goal = task.goal;
    if (data.priority !== undefined && task.priority !== before.priority) changedFields.priority = task.priority;
    if (data.assignedAgent !== undefined || data.assigned_agent !== undefined) changedFields.assignedAgent = task.assignedAgent;
    if (data.tags !== undefined && task.tags !== before.tags) changedFields.tags = task.tags;

    if (data.status !== undefined && task.status !== before.status) {
      await db.insert(events).values({
        taskId: task.id,
        agentName: 'system',
        eventType: 'status_change',
        payload: `Status: ${before.status} → ${task.status}`,
      });
    }

    if (Object.keys(changedFields).length > 0) {
      await db.insert(events).values({
        taskId: task.id,
        agentName: 'system',
        eventType: 'updated',
        payload: JSON.stringify(changedFields),
      });
    }
  }

  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as { id?: number };
  const id = body.id;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  await db.delete(tasks).where(eq(tasks.id, id));
  await db.insert(events).values({
    taskId: id,
    agentName: 'system',
    eventType: 'deleted',
    payload: `Task deleted: ${existing.title}`,
  });

  return NextResponse.json({ ok: true });
}
