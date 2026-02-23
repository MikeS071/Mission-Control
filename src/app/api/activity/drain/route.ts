import { NextRequest, NextResponse } from 'next/server';
import { drainQueue, broadcastFeedUpdate } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const DRAIN_SECRET = process.env.MC_API_SECRET ?? process.env.DEPLOY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-drain-secret') ?? '';

  if (!DRAIN_SECRET || secret !== DRAIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
  const tenantId = tenantIdParam ? parseInt(tenantIdParam, 10) : undefined;

  const created = await drainQueue(tenantId && !isNaN(tenantId) ? tenantId : undefined);

  // Broadcast each new event to SSE clients
  const broadcastTenants = new Set(created.map((e) => e.tenantId));
  for (const tid of broadcastTenants) {
    const tenantEvents = created.filter((e) => e.tenantId === tid);
    for (const event of tenantEvents) {
      broadcastFeedUpdate(tid, 'activity.event.created', event);
    }
  }

  return NextResponse.json({ ok: true, created: created.length });
}
