import { openclawGatewayCall } from './openclaw-gateway-cli';

export type OpenClawUiMessage = {
  role: 'user' | 'assistant' | 'system';
  /** extracted concatenated text blocks */
  text: string;
  timestamp: number;
};

function sessionKeyForTenant(tenantId: number): string {
  return `agent:main:webchat:tenant:${tenantId}`;
}

function extractTextBlocks(content: any): string {
  // content is typically an array of blocks: [{type:'text', text:'...'}, {type:'toolCall', ...}, ...]
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    // ignore thinking/toolCall/toolResult for MVP
  }
  return parts.join('');
}

function normalizeRole(role: unknown): OpenClawUiMessage['role'] {
  const r = String(role ?? '').toLowerCase().trim();
  if (r === 'user' || r === 'assistant' || r === 'system') return r;
  return 'assistant';
}

export async function openclawChatHistory(params: {
  tenantId: number;
  limit?: number;
}): Promise<{ messages: OpenClawUiMessage[] }> {
  const sessionKey = sessionKeyForTenant(params.tenantId);
  const limit = Math.max(1, Math.min(200, params.limit ?? 80));

  const payload = (await openclawGatewayCall('chat.history', { sessionKey, limit }, { timeoutMs: 30_000 })) as any;

  const rawMessages: any[] = Array.isArray(payload?.messages) ? payload.messages : [];

  const messages: OpenClawUiMessage[] = rawMessages
    .map((m) => {
      const role = normalizeRole(m?.role);
      const text = extractTextBlocks(m?.content);
      const ts = Number(m?.timestamp);
      return {
        role,
        text,
        timestamp: Number.isFinite(ts) ? ts : Date.now(),
      } satisfies OpenClawUiMessage;
    })
    .filter((m) => m.text.trim().length > 0);

  return { messages };
}

export async function openclawChatSend(params: {
  tenantId: number;
  message: string;
  idempotencyKey: string;
}): Promise<{ runId: string; status: string }> {
  const sessionKey = sessionKeyForTenant(params.tenantId);

  const payload = (await openclawGatewayCall(
    'chat.send',
    {
      sessionKey,
      message: params.message,
      idempotencyKey: params.idempotencyKey,
      deliver: false,
    },
    { timeoutMs: 30_000 },
  )) as any;

  return {
    runId: String(payload?.runId ?? ''),
    status: String(payload?.status ?? ''),
  };
}
