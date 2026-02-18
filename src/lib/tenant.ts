import { NextRequest } from 'next/server';

/**
 * Returns the tenantId injected by middleware.
 * - Session-authenticated requests: set from JWT via x-tenant-id header.
 * - Bearer-token requests: defaults to tenant 1 (backward-compat for automation scripts).
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
