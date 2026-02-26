import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { taskPrdVersions, tasks } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';
import { ensurePrdDir, buildCanonicalPrdPath, writeWorkspaceMarkdown } from '@/lib/prd-files';
import { generatePrdMarkdown } from '@/lib/prd-ai';
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
  if (task.prdPath) return NextResponse.json({ prdPath: task.prdPath, prdVersion: task.prdVersion, alreadyExists: true });

  const title = task.title;
  const description = task.description ?? '';
  if (!title.trim() || !description.trim()) {
    return NextResponse.json({ error: 'Add a title and description before generating a PRD.' }, { status: 400 });
  }

  const prd = await generatePrdMarkdown({ title, description });
  if (!prd) {
    return NextResponse.json({ error: 'PRD generation unavailable (missing LLM key or provider error).' }, { status: 500 });
  }

  const canonicalPath = buildCanonicalPrdPath(task.id, title);
  ensurePrdDir();
  try {
    writeWorkspaceMarkdown(canonicalPath, prd.markdown + '\n');
  } catch {
    return NextResponse.json({ error: 'Failed to write PRD file.' }, { status: 500 });
  }

  const now = new Date();
  await db
    .update(tasks)
    .set({
      prdPath: canonicalPath,
      prdCanonicalPath: canonicalPath,
      prdVersion: 1,
      prdLastUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));

  await db.insert(taskPrdVersions).values({
    tenantId,
    taskId,
    versionNumber: 1,
    path: canonicalPath,
    source: 'generate',
    isCurrent: true,
    createdBy: 'system',
    createdAt: now,
  });

  void postAssistantMessage(tenantId, `PRD generated for **${task.title}**. Open it from the card to review and edit.`);

  return NextResponse.json({ prdPath: canonicalPath, prdCanonicalPath: canonicalPath, prdVersion: 1 });
}
