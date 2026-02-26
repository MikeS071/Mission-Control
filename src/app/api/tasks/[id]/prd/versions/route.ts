import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { taskPrdVersions, tasks } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId) || taskId <= 0) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const versions = await db
    .select({
      id: taskPrdVersions.id,
      versionNumber: taskPrdVersions.versionNumber,
      path: taskPrdVersions.path,
      source: taskPrdVersions.source,
      isCurrent: taskPrdVersions.isCurrent,
      createdAt: taskPrdVersions.createdAt,
      createdBy: taskPrdVersions.createdBy,
      changeNote: taskPrdVersions.changeNote,
    })
    .from(taskPrdVersions)
    .where(and(eq(taskPrdVersions.taskId, taskId), eq(taskPrdVersions.tenantId, tenantId)))
    .orderBy(asc(taskPrdVersions.versionNumber));

  return NextResponse.json({ versions });
}
