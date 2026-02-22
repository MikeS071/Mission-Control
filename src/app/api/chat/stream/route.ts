/**
 * Chat SSE Stream
 * GET /api/chat/stream
 *
 * Server-Sent Events endpoint for real-time chat updates.
 * - Polls for new messages every 3 seconds
 * - Returns messages as SSE events: data: {"id": N, "role": "...", "content": "...", "createdAt": "..."}
 * - Closes after 60 seconds (Next.js streaming timeout)
 *
 * Requires NextAuth session.
 */
import { NextRequest } from 'next/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

const POLL_INTERVAL_MS = 3000;
const STREAM_TIMEOUT_MS = 60000;

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let lastMessageId = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();

      const poll = async () => {
        try {
          // Check for messages newer than lastMessageId
          const newMessages = await db
            .select({
              id: chatMessages.id,
              role: chatMessages.role,
              content: chatMessages.content,
              createdAt: chatMessages.createdAt,
            })
            .from(chatMessages)
            .where(
              lastMessageId > 0
                ? and(eq(chatMessages.tenantId, tenantId), gt(chatMessages.id, lastMessageId))
                : eq(chatMessages.tenantId, tenantId)
            )
            .orderBy(desc(chatMessages.createdAt))
            .limit(10);

          // Send new messages as SSE events
          for (const msg of newMessages.reverse()) {
            const data = JSON.stringify({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt.toISOString(),
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            lastMessageId = Math.max(lastMessageId, msg.id);
          }

          // Check if stream timeout reached
          if (Date.now() - startTime > STREAM_TIMEOUT_MS) {
            controller.close();
            return;
          }

          // Schedule next poll
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (err) {
          console.error('[chat/stream] Poll error:', err);
          controller.close();
        }
      };

      // Start polling
      await poll();
    },
    cancel() {
      // Cleanup when client disconnects
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
