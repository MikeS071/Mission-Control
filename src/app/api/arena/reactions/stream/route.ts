import { NextRequest } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { subscribeToArenaReactionEvents } from '@/lib/arena-reactions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeToArenaReactionEvents((event) => {
        if (event.toTenantId !== tenantId) return;
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      const timeout = setTimeout(() => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      }, 120000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
