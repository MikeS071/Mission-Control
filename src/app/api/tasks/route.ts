import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendTelegramMessage } from '@/lib/telegram';
import { getTenantId } from '@/lib/tenant';
import { awardXp, XP_RULES } from '@/lib/xp';

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

function mapInput(body: TaskInput, tenantId: number) {
  return {
    tenantId,
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

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await db
    .select()
    .from(tasks)
    .where(eq(tasks.tenantId, tenantId))
    .orderBy(tasks.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as TaskInput;
  const [task] = await db.insert(tasks).values(mapInput(body, tenantId)).returning();

  if (task) {
    await db.insert(events).values({
      tenantId,
      taskId: task.id,
      agentName: 'system',
      eventType: 'created',
      payload: `Task created: ${task.title}`,
    });

    void awardXp(tenantId, XP_RULES.TASK_CREATED, 'task_created', String(task.id));

    void sendTelegramMessage(`🆕 Task created: <b>${task.title}</b> [${task.priority}] → ${task.goal}`);
  }

  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as TaskInput;
  const { id, ...data } = body;

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const [before] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const updates = mapPatch(data);
  const [task] = await db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
    .returning();

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
  }

  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as { id?: number };
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  await db.insert(events).values({
    tenantId,
    taskId: null,
    agentName: 'system',
    eventType: 'deleted',
    payload: `Task deleted: ${existing.title}`,
  });
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
  void sendTelegramMessage(`🗑️ Task deleted: <b>${existing.title}</b>`);

  return NextResponse.json({ ok: true });
}
