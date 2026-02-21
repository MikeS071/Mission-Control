import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { sendTelegramMessage } from '@/lib/telegram';
import { getTenantId } from '@/lib/tenant';
import { awardXp, XP_RULES } from '@/lib/xp';
import { generateChecklistItems, parseChecklist, stringifyChecklist } from '@/lib/checklist-ai';
import { parseBody, TaskPatchSchema } from '@/lib/validate';

const TASK_NOTIFICATIONS_CHAT_ID = '1556514337';

const normalizeStatus = (status?: string) => {
  const value = (status || '').toLowerCase();
  if (['done', 'complete', 'completed'].includes(value)) return 'done';
  if (value === 'review') return 'review';
  if (['in progress', 'in_progress', 'assigned'].includes(value)) return 'in_progress';
  // 'todo' and unknown values map to 'backlog' for backwards compatibility
  return 'backlog';
};

const normalizePriority = (priority?: string) => {
  const value = (priority || '').toLowerCase();
  if (value === 'low') return 'Low';
  if (value === 'high') return 'High';
  if (value === 'critical') return 'Critical';
  return 'Medium';
};

type ChecklistInputValue = Array<{ id: string; text: string; checked: boolean }> | string | undefined;

const parseChecklistInput = (checklist: ChecklistInputValue) => {
  if (typeof checklist === 'string') return parseChecklist(checklist);
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((item, index) => ({
      id: item.id || `item-${Date.now()}-${index}`,
      text: (item.text || '').trim(),
      checked: Boolean(item.checked),
    }))
    .filter((item) => item.text.length > 0);
};

function mapTaskOutput(task: typeof tasks.$inferSelect) {
  return {
    ...task,
    checklist: parseChecklist(task.checklist),
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId))).limit(1);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json(mapTaskOutput(task));
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);

  const parsed = parseBody(TaskPatchSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const [before] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId))).limit(1);
  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const updates: Partial<typeof tasks.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim() || 'Untitled Task';
  if (body.description !== undefined) updates.description = body.description;
  if (body.goal !== undefined) updates.goal = body.goal;
  if (body.priority !== undefined) updates.priority = normalizePriority(body.priority);
  if (body.status !== undefined) updates.status = normalizeStatus(body.status);
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.assignedAgent !== undefined || body.assigned_agent !== undefined) updates.assignedAgent = body.assignedAgent ?? body.assigned_agent ?? null;

  if (body.checklist !== undefined) {
    const manualChecklist = parseChecklistInput(body.checklist);
    const nextTitle = updates.title ?? before.title;
    const nextDescription = updates.description ?? before.description ?? '';
    const aiChecklist = manualChecklist.length === 0 ? await generateChecklistItems(nextTitle, nextDescription) : [];
    updates.checklist = stringifyChecklist(manualChecklist.length > 0 ? manualChecklist : aiChecklist);
  }

  const [task] = await db.update(tasks).set(updates).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId))).returning();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (body.status !== undefined && task.status !== before.status) {
    await db.insert(events).values({
      tenantId,
      taskId: task.id,
      agentName: 'system',
      eventType: 'task_status_changed',
      payload: JSON.stringify({
        task_id: task.id,
        title: task.title,
        old_status: before.status,
        new_status: task.status,
      }),
    });

    if (task.status === 'done') void awardXp(tenantId, XP_RULES.TASK_COMPLETED, 'task_completed', String(task.id));
    void sendTelegramMessage(`🔄 ${task.title}: ${before.status} → ${task.status}`, TASK_NOTIFICATIONS_CHAT_ID);
  }

  return NextResponse.json(mapTaskOutput(task));
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);

  const [existing] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId))).limit(1);
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
