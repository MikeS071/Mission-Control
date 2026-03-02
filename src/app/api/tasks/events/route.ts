import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { events } from '@/db/schema';
import { auth } from '@/lib/auth';
import { emitTaskEvent, type TaskEventType } from '@/lib/kanbanTrigger';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';

const eventTypeSchema = z.enum(['created', 'moved', 'completed', 'overdue'] as const);

const createTaskEventSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  event: eventTypeSchema,
  metadata: z.record(z.string(), z.any()).optional(),
});

const TASK_EVENT_TYPES = ['task_created', 'task_moved', 'task_completed', 'task_overdue'] as const;

function toStoredEventType(type: TaskEventType) {
  return `task_${type}` as (typeof TASK_EVENT_TYPES)[number];
}

function parsePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function resolveRequestUserId(req: NextRequest, fallback?: unknown): number | null {
  const fromHeader = req.headers.get('x-user-id');
  if (fromHeader) {
    const parsed = Number(fromHeader);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  if (typeof fallback === 'number' && Number.isInteger(fallback) && fallback > 0) return fallback;
  if (typeof fallback === 'string') {
    const parsed = Number(fallback);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const typeRaw = new URL(req.url).searchParams.get('type');
  const parsedType = eventTypeSchema.safeParse(typeRaw ?? undefined);
  if (typeRaw && !parsedType.success) {
    return NextResponse.json({ error: 'Invalid event type filter' }, { status: 400 });
  }

  const whereClause = parsedType.success && parsedType.data
    ? and(eq(events.tenantId, tenantId), eq(events.eventType, toStoredEventType(parsedType.data)))
    : and(eq(events.tenantId, tenantId), inArray(events.eventType, TASK_EVENT_TYPES as unknown as string[]));

  const rows = await db
    .select({
      id: events.id,
      taskId: events.taskId,
      tenantId: events.tenantId,
      eventType: events.eventType,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(whereClause)
    .orderBy(desc(events.createdAt))
    .limit(50);

  const response = rows.map((row) => {
    const payload = parsePayload(row.payload);
    return {
      id: row.id,
      tenantId: row.tenantId,
      taskId: row.taskId,
      event: row.eventType.replace(/^task_/, '') as TaskEventType,
      userId: payload.userId ?? null,
      metadata: (payload.metadata ?? {}) as Record<string, unknown>,
      timestamp: row.createdAt,
    };
  });

  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await auth();
  const isAdmin = Boolean(session?.user?.isAdmin) || (session as { tenantId?: number } | null)?.tenantId === 1;
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const parsed = parseBody(createTaskEventSchema, await req.json());
  if (!parsed.ok) return parsed.response;

  const userId = resolveRequestUserId(req, session?.user?.id);
  const body = parsed.data;
  const metadata = {
    ...(body.metadata ?? {}),
    tenantId,
    userId,
    source: 'manual',
  };

  await emitTaskEvent(body.taskId, body.event as TaskEventType, metadata);
  return NextResponse.json({ ok: true }, { status: 201 });
}
