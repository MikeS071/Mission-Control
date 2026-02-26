import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tasks } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';
import {
  buildCanonicalPrdPath,
  buildVersionedPrdPath,
  isVersionedPrdPath,
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

  let currentMarkdown = '';
  try {
    currentMarkdown = readWorkspaceMarkdown(task.prdPath);
  } catch {
    return NextResponse.json({ error: 'PRD file not found' }, { status: 404 });
  }

  const next = await updatePrdMarkdown({
    title: task.title,
    description: task.description ?? '',
    currentMarkdown,
  });
  if (!next) {
    return NextResponse.json({ error: 'PRD update unavailable (missing LLM key or provider error).' }, { status: 500 });
  }

  const version = task.prdVersion || 1;
  const canonical = task.prdCanonicalPath ?? buildCanonicalPrdPath(task.id, task.title);
  const desired = isVersionedPrdPath(task.prdPath)
    ? buildVersionedPrdPath(task.id, task.title, version)
    : canonical;

  try {
    if (desired !== task.prdPath) {
      writeWorkspaceMarkdown(desired, next.markdown + '\n');
      writeWorkspaceMarkdown(task.prdPath, movedToStub(desired));
    } else {
      writeWorkspaceMarkdown(task.prdPath, next.markdown + '\n');
    }
  } catch {
    return NextResponse.json({ error: 'Failed to write PRD file.' }, { status: 500 });
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({
      prdPath: desired,
      prdCanonicalPath: canonical,
      prdLastUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));

  void postAssistantMessage(tenantId, `PRD updated for **${task.title}** — please review.`);

  return NextResponse.json({ prdPath: desired, prdCanonicalPath: canonical, prdVersion: version });
}
