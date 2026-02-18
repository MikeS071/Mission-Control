import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';

type TaskInput = {
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

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const taskId = Number(id);
  const body = (await req.json()) as TaskInput;
  const [before] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);

  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const [task] = await db
    .update(tasks)
    .set(mapPatch(body))
    .where(eq(tasks.id, taskId))
    .returning();

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const changedFields: Record<string, string | null> = {};
  if (body.title !== undefined && task.title !== before.title) changedFields.title = task.title;
  if (body.description !== undefined && task.description !== before.description) changedFields.description = task.description;
  if (body.goal !== undefined && task.goal !== before.goal) changedFields.goal = task.goal;
  if (body.priority !== undefined && task.priority !== before.priority) changedFields.priority = task.priority;
  if (body.assignedAgent !== undefined || body.assigned_agent !== undefined) changedFields.assignedAgent = task.assignedAgent;
  if (body.tags !== undefined && task.tags !== before.tags) changedFields.tags = task.tags;

  if (body.status !== undefined && task.status !== before.status) {
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

  return NextResponse.json(task);
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const taskId = Number(id);
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);

  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.insert(events).values({
    taskId,
    agentName: 'system',
    eventType: 'deleted',
    payload: `Task deleted: ${existing.title}`,
  });

  return NextResponse.json({ ok: true });
}
