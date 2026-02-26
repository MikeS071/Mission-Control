import { db } from '@/lib/db';
import { chatMessages } from '@/db/schema';
import { bumpThreadUpdatedAt, getOrCreateDefaultThreadId } from '@/lib/chat-threads';

export async function postAssistantMessage(tenantId: number, content: string): Promise<void> {
  const threadId = await getOrCreateDefaultThreadId(tenantId);

  await db.insert(chatMessages).values({
    tenantId,
    role: 'assistant',
    content,
    source: 'mc',
    threadId,
  });

  void bumpThreadUpdatedAt(threadId);
}
