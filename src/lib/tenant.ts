import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships } from '@/db/schema';
import { auth } from '@/lib/auth';

/**
 * Sync path: reads x-tenant-id injected by middleware, or validates Bearer token.
 */
export function getTenantId(req: NextRequest): number | null {
  const value = req.headers.get('x-tenant-id');
  if (value) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && token === process.env.API_SECRET) return 1;

  return null;
}

/**
 * Async path: extends getTenantId with two fallbacks:
 * 1. x-user-email header → DB lookup (set by middleware when tenantId missing from JWT)
 * 2. Direct auth() call → full Node.js session read (handles edge middleware JWT failures)
 */
export async function resolveTenantId(req: NextRequest): Promise<number | null> {
  const sync = getTenantId(req);
  if (sync !== null) return sync;

  // Fallback 1: email header from middleware
  const email = req.headers.get('x-user-email');
  if (email) {
    const [row] = await db
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(eq(memberships.userEmail, email))
      .limit(1);
    if (row?.tenantId) return row.tenantId;
  }

  // Fallback 2: direct session read — works even when edge middleware can't decode JWT
  try {
    const session = await auth();
    if (typeof session?.tenantId === 'number') return session.tenantId;
    if (session?.user?.email) {
      const [row] = await db
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userEmail, session.user.email))
        .limit(1);
      if (row?.tenantId) return row.tenantId;
    }
  } catch {
    // auth() unavailable in this context — not fatal
  }

  return null;
}
