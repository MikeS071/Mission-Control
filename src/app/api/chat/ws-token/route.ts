/**
 * WS Token
 * GET /api/chat/ws-token
 *
 * Issues a short-lived (30s) one-use token that the browser passes as a
 * query parameter when opening the WebSocket connection. Needed because
 * browsers cannot set custom headers on WebSocket upgrades.
 *
 * Requires NextAuth session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { wsManager } from '@/lib/ws-manager';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = wsManager.createToken(tenantId);
  return NextResponse.json({ token });
}
