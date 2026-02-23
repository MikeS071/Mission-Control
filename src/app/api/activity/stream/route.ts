import { NextRequest } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { registerFeedClient, unregisterFeedClient } from '@/lib/activity';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      registerFeedClient(tenantId, controller);

      // Initial keepalive so the client knows the connection is live
      try {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      } catch { /* client already gone */ }

      // Keepalive every 25 seconds to prevent proxy/browser timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        unregisterFeedClient(tenantId, controller);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    },
  });
}
