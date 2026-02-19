import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships } from '@/db/schema';

/**
 * Returns the tenantId injected by middleware.
 * - Session-authenticated requests: set from JWT via x-tenant-id header.
 * - Bearer-token requests: defaults to tenant 1 (backward-compat for automation scripts).
 * Falls back to email-based DB lookup if tenantId missing but email header is present
 * (handles edge middleware JWT cases where tenantId isn't propagated).
 */
export function getTenantId(req: NextRequest): number | null {
  const value = req.headers.get('x-tenant-id');
  if (value) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }

  // Backward-compat for automation scripts using bearer token.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token && token === process.env.API_SECRET) return 1;

  return null;
}

/**
 * Like getTenantId but also handles the case where the session has an email
 * but no tenantId (JWT edge propagation issue). Does a DB lookup as fallback.
 */
export async function resolveTenantId(req: NextRequest): Promise<number | null> {
  const sync = getTenantId(req);
  if (sync !== null) return sync;

  const email = req.headers.get('x-user-email');
  if (!email) return null;

  const [existing] = await db
    .select({ tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userEmail, email))
    .limit(1);

  return existing?.tenantId ?? null;
}
