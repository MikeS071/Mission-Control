import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { events, tasks } from '@/db/schema';
import { sendTelegramMessage } from '@/lib/telegram';
import { resolveTenantId } from '@/lib/tenant';
import { awardXp, XP_RULES } from '@/lib/xp';
import { generateChecklistItems, parseChecklist, stringifyChecklist } from '@/lib/checklist-ai';
import { parseBody, TaskCreateSchema, TaskPatchSchema } from '@/lib/validate';

const TaskPatchWithIdSchema = TaskPatchSchema.extend({
  id: z.number().int().positive('id must be a positive integer'),
});

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

type ChecklistInputValue = Array<{ id: string; text: string; checked: boolean }> | string | undefined;

const parseChecklistInput = (checklist: ChecklistInputValue) => {
  if (typeof checklist === 'string') return parseChecklist(checklist);
  if (Array.isArray(checklist)) {
    return checklist
      .map((item, index) => ({
        id: item.id || `item-${Date.now()}-${index}`,
        text: (item.text || '').trim(),
        checked: Boolean(item.checked),
      }))
      .filter((item) => item.text.length > 0);
  }
  return [];
};

async function generateGoalId(tenantId: number) {
  const rows = await db
    .select({ goalId: tasks.goalId })
    .from(tasks)
    .where(eq(tasks.tenantId, tenantId));

  const current = rows.reduce((max, row) => {
    const parsed = Number((row.goalId || '').replace(/^G/, ''));
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);

  return `G${String(current + 1).padStart(3, '0')}`;
}

function mapTaskOutput(task: typeof tasks.$inferSelect) {
  return {
    ...task,
    checklist: parseChecklist(task.checklist),
  };
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await db.select().from(tasks).where(eq(tasks.tenantId, tenantId)).orderBy(tasks.createdAt);
  return NextResponse.json(all.map(mapTaskOutput));
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const parsed = parseBody(TaskCreateSchema, await req.json());
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const title = body.title.trim() || 'Untitled Task';
    const description = body.description || '';
    const providedChecklist = parseChecklistInput(body.checklist);
    const aiChecklist = providedChecklist.length === 0 ? await generateChecklistItems(title, description) : [];
    const checklist = providedChecklist.length > 0 ? providedChecklist : aiChecklist;
    const goalId = await generateGoalId(tenantId);

    const [task] = await db
      .insert(tasks)
      .values({
        tenantId,
        title,
        description,
        goal: body.goal || goalId,
        goalId,
        priority: normalizePriority(body.priority),
        status: normalizeStatus(body.status),
        assignedAgent: body.assignedAgent ?? body.assigned_agent ?? null,
        tags: body.tags || '',
        checklist: stringifyChecklist(checklist),
        updatedAt: new Date(),
      })
      .returning();

    if (task) {
      await db.insert(events).values({
        tenantId,
        taskId: task.id,
        agentName: 'system',
        eventType: 'created',
        payload: `Task created: ${task.title} (${task.goalId})`,
      });

      void awardXp(tenantId, XP_RULES.TASK_CREATED, 'task_created', String(task.id));
      void sendTelegramMessage(`🆕 Goal created: <b>${task.goalId}</b> ${task.title} [${task.priority}]`);
    }

    return NextResponse.json(task ? mapTaskOutput(task) : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to create task: ${message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsedPatch = parseBody(TaskPatchWithIdSchema, await req.json());
  if (!parsedPatch.ok) return parsedPatch.response;
  const { id, ...data } = parsedPatch.data;

  const [before] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId))).limit(1);
  if (!before) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const updates: Partial<typeof tasks.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title.trim() || 'Untitled Task';
  if (data.description !== undefined) updates.description = data.description;
  if (data.goal !== undefined) updates.goal = data.goal;
  if (data.priority !== undefined) updates.priority = normalizePriority(data.priority);
  if (data.status !== undefined) updates.status = normalizeStatus(data.status);
  if (data.tags !== undefined) updates.tags = data.tags;
  if (data.assignedAgent !== undefined || data.assigned_agent !== undefined) updates.assignedAgent = data.assignedAgent ?? data.assigned_agent ?? null;

  if (data.checklist !== undefined) {
    const providedChecklist = parseChecklistInput(data.checklist);
    const nextTitle = updates.title ?? before.title;
    const nextDescription = updates.description ?? before.description ?? '';
    const aiChecklist = providedChecklist.length === 0 ? await generateChecklistItems(nextTitle, nextDescription) : [];
    const merged = providedChecklist.length > 0 ? providedChecklist : aiChecklist;
    updates.checklist = stringifyChecklist(merged);
  }

  const [task] = await db.update(tasks).set(updates).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId))).returning();
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (data.status !== undefined && task.status !== before.status) {
    await db.insert(events).values({
      tenantId,
      taskId: task.id,
      agentName: 'system',
      eventType: 'status_change',
      payload: `Status: ${before.status} → ${task.status}`,
    });
    if (task.status === 'done') void awardXp(tenantId, XP_RULES.TASK_COMPLETED, 'task_completed', String(task.id));
    void sendTelegramMessage(`🔄 <b>${task.title}</b>: ${before.status} → ${task.status}`);
  }

  return NextResponse.json(mapTaskOutput(task));
}

export async function DELETE(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsedDel = parseBody(z.object({ id: z.number().int().positive('id must be a positive integer') }), await req.json());
  if (!parsedDel.ok) return parsedDel.response;
  const { id } = parsedDel.data;

  const [existing] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId))).limit(1);
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
