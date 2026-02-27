import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { taskPrdVersions, tasks } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';
import { readWorkspaceMarkdown, writeWorkspaceMarkdown } from '@/lib/prd-files';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId) || taskId <= 0) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!task.prdPath) return NextResponse.json({ error: 'No PRD linked' }, { status: 404 });

  try {
    const content = readWorkspaceMarkdown(task.prdPath);
    return NextResponse.json({
      prdPath: task.prdPath,
      prdCanonicalPath: task.prdCanonicalPath,
      prdVersion: task.prdVersion,
      content,
    });
  } catch {
    return NextResponse.json({ error: 'PRD file not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId) || taskId <= 0) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });

  const body = (await req.json().catch(() => null)) as null | {
    content?: string;
    source?: 'manual' | 'restored' | 'new_version' | 'generate';
    changeNote?: string;
    createdBy?: string;
  };
  if (!body || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 });
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!task.prdPath) return NextResponse.json({ error: 'No PRD linked' }, { status: 404 });

  try {
    writeWorkspaceMarkdown(task.prdPath, body.content);
  } catch {
    return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  }

  const now = new Date();
  const nextVersion = (task.prdVersion ?? 1) + 1;

  await db
    .update(taskPrdVersions)
    .set({ isCurrent: false })
    .where(and(eq(taskPrdVersions.taskId, taskId), eq(taskPrdVersions.tenantId, tenantId), eq(taskPrdVersions.isCurrent, true)));

  await db.insert(taskPrdVersions).values({
    tenantId,
    taskId,
    versionNumber: nextVersion,
    path: task.prdPath,
    source: body.source ?? 'manual',
    isCurrent: true,
    changeNote: body.changeNote ?? null,
    createdBy: body.createdBy ?? 'user',
    createdAt: now,
  });

  await db
    .update(tasks)
    .set({ prdVersion: nextVersion, prdLastUpdatedAt: now, updatedAt: now })
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));

  return NextResponse.json({ ok: true, prdVersion: nextVersion });
}
