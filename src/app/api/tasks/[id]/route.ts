import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendTelegramMessage } from '@/lib/telegram';
import { getTenantId } from '@/lib/tenant';
import { awardXp, XP_RULES } from '@/lib/xp';

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

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  const body = (await req.json()) as TaskInput;

  const [before] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const [task] = await db
    .update(tasks)
    .set(mapPatch(body))
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
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
      tenantId,
      taskId: task.id,
      agentName: 'system',
      eventType: 'status_change',
      payload: `Status: ${before.status} → ${task.status}`,
    });

    if (task.status === 'done') {
      void awardXp(tenantId, XP_RULES.TASK_COMPLETED, 'task_completed', String(task.id));
    }

    void sendTelegramMessage(`🔄 <b>${task.title}</b>: ${before.status} → ${task.status}`);
  }

  if (Object.keys(changedFields).length > 0) {
    await db.insert(events).values({
      tenantId,
      taskId: task.id,
      agentName: 'system',
      eventType: 'updated',
      payload: JSON.stringify(changedFields),
    });
  }

  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  await db.insert(events).values({
    tenantId,
    taskId: null,
    agentName: 'system',
    eventType: 'deleted',
    payload: `Task deleted: ${existing.title}`,
  });
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));
  void sendTelegramMessage(`🗑️ Task deleted: <b>${existing.title}</b>`);

  return NextResponse.json({ ok: true });
}
