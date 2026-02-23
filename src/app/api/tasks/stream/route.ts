import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveTenantId } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const all = await db
            .select()
            .from(tasks)
            .where(eq(tasks.tenantId, tenantId))
            .orderBy(tasks.createdAt);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(all)}\n\n`));
        } catch {}
      };
      await send();
      const interval = setInterval(send, 5000);
      // Keepalive comment every 15s — prevents Tailscale / CF from closing idle connections
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { clearInterval(keepalive); }
      }, 15_000);
      // Clean up if client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clearInterval(keepalive);
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
