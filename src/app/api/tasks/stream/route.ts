import { db } from '@/lib/db';
import { tasks } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const all = await db.select().from(tasks).orderBy(tasks.createdAt);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(all)}\n\n`));
        } catch {}
      };
      await send();
      const interval = setInterval(send, 5000);
      setTimeout(() => { clearInterval(interval); controller.close(); }, 300000);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
