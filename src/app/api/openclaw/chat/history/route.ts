import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { openclawChatHistory } from '@/lib/openclaw-chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLimit(raw: string | null): number {
  // Be permissive: accept numeric prefixes like "120," or "1)".
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 80;
  return Math.min(200, Math.max(1, n));
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));

  try {
    const { messages } = await openclawChatHistory({ tenantId, limit });
    return NextResponse.json({ messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Gateway error', details: msg }, { status: 502 });
  }
}
