import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { taskPrdVersions, tasks } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';
import {
  buildCanonicalPrdPath,
  buildVersionedPrdPath,
  ensurePrdDir,
  movedToStub,
  readWorkspaceMarkdown,
  writeWorkspaceMarkdown,
} from '@/lib/prd-files';
import { updatePrdMarkdown } from '@/lib/prd-ai';
import { postAssistantMessage } from '@/lib/chat-system';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  const currentMarkdown = (() => {
    try {
      return readWorkspaceMarkdown(task.prdPath!);
    } catch {
      return '';
    }
  })();

  const nextVersion = (task.prdVersion ?? 1) + 1;
  const canonical = task.prdCanonicalPath ?? buildCanonicalPrdPath(task.id, task.title);
  const vPrevPath = buildVersionedPrdPath(task.id, task.title, task.prdVersion ?? 1);
  const vNextPath = buildVersionedPrdPath(task.id, task.title, nextVersion);

  const next = await updatePrdMarkdown({
    title: task.title,
    description: task.description ?? '',
    currentMarkdown,
  });
  if (!next) {
    return NextResponse.json({ error: 'PRD update unavailable (missing LLM key or provider error).' }, { status: 500 });
  }

  ensurePrdDir();

  const now = new Date();

  // Archive previous version and update canonical stub.
  try {
    // If the current file is the canonical path, preserve its content as v1/vN.
    if (task.prdPath === canonical) {
      writeWorkspaceMarkdown(vPrevPath, currentMarkdown || '\n');
    }

    writeWorkspaceMarkdown(canonical, movedToStub(vNextPath));

    writeWorkspaceMarkdown(vNextPath, next.markdown + '\n');
  } catch {
    return NextResponse.json({ error: 'Failed to write PRD files.' }, { status: 500 });
  }

  // Mark all existing versions non-current.
  await db
    .update(taskPrdVersions)
    .set({ isCurrent: false })
    .where(and(eq(taskPrdVersions.taskId, taskId), eq(taskPrdVersions.tenantId, tenantId), eq(taskPrdVersions.isCurrent, true)));

  // Ensure v1/vPrev row exists; if a row exists with version_number=1, update its path if needed.
  if ((task.prdVersion ?? 1) === 1) {
    await db
      .update(taskPrdVersions)
      .set({ path: vPrevPath })
      .where(and(eq(taskPrdVersions.taskId, taskId), eq(taskPrdVersions.tenantId, tenantId), eq(taskPrdVersions.versionNumber, 1)));
  }

  await db.insert(taskPrdVersions).values({
    tenantId,
    taskId,
    versionNumber: nextVersion,
    path: vNextPath,
    source: 'new_version',
    isCurrent: true,
    parentVersionId: null,
    createdBy: 'system',
    createdAt: now,
  });

  await db
    .update(tasks)
    .set({
      prdPath: vNextPath,
      prdCanonicalPath: canonical,
      prdVersion: nextVersion,
      prdLastUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));

  void postAssistantMessage(tenantId, `Created PRD version v${nextVersion} for **${task.title}**. Please review.`);

  return NextResponse.json({ prdPath: vNextPath, prdCanonicalPath: canonical, prdVersion: nextVersion });
}
