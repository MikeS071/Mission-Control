import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatThreads } from '@/db/schema';

/**
 * Return the tenant's default chat thread id.
 *
 * We treat the oldest thread as the default. If none exist, create "Main".
 */
export async function getOrCreateDefaultThreadId(tenantId: number): Promise<number> {
  const [existing] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(eq(chatThreads.tenantId, tenantId))
    .orderBy(asc(chatThreads.createdAt))
    .limit(1);

  if (existing?.id) return existing.id;

  const [ins] = await db
    .insert(chatThreads)
    .values({ tenantId, title: 'Main' })
    .returning({ id: chatThreads.id });

  return ins.id;
}

export async function isThreadOwnedByTenant(tenantId: number, threadId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.tenantId, tenantId)))
    .limit(1);

  return !!row?.id;
}

/** Resolve threadId param, falling back to default if missing/invalid/not-owned. */
export async function resolveThreadId(tenantId: number, threadIdParam: unknown): Promise<number> {
  const parsed = typeof threadIdParam === 'string' ? parseInt(threadIdParam, 10) : (typeof threadIdParam === 'number' ? threadIdParam : NaN);
  const candidate = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
  if (!candidate) return getOrCreateDefaultThreadId(tenantId);
  if (await isThreadOwnedByTenant(tenantId, candidate)) return candidate;
  return getOrCreateDefaultThreadId(tenantId);
}

export async function bumpThreadUpdatedAt(threadId: number): Promise<void> {
  try {
    await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId));
  } catch {
    // best-effort
  }
}
