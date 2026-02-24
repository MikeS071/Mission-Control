import { openclawGatewayCall } from './openclaw-gateway-cli';

export type OpenClawUiMessage = {
  role: 'user' | 'assistant';
  /** extracted concatenated text blocks */
  text: string;
  timestamp: number;
};

function sessionKeyForTenant(tenantId: number, convId?: string | null): string {
  const base = `agent:main:webchat:tenant:${tenantId}`;
  if (!convId) return base;
  return `${base}:conv:${convId}`;
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

function normalizeRole(role: unknown): OpenClawUiMessage['role'] | null {
  const r = String(role ?? '').trim();
  if (!r) return null;

  // Only surface user/assistant to MC Chat UI.
  // Explicitly hide toolCall/toolResult and other internal roles.
  const lower = r.toLowerCase();
  if (lower === 'user') return 'user';
  if (lower === 'assistant') return 'assistant';
  return null;
}

export async function openclawChatHistory(params: {
  tenantId: number;
  convId?: string | null;
  limit?: number;
}): Promise<{ messages: OpenClawUiMessage[] }> {
  const sessionKey = sessionKeyForTenant(params.tenantId, params.convId);
  const limit = Math.max(1, Math.min(200, params.limit ?? 80));

  const payload = (await openclawGatewayCall('chat.history', { sessionKey, limit }, { timeoutMs: 30_000 })) as any;

  const rawMessages: any[] = Array.isArray(payload?.messages) ? payload.messages : [];

  const messages: OpenClawUiMessage[] = rawMessages
    .map((m) => {
      const role = normalizeRole(m?.role);
      if (!role) return null;

      const text = extractTextBlocks(m?.content);
      const ts = Number(m?.timestamp);

      // Hide MC-internal user prompts from the transcript UI.
      if (role === 'user' && text.trimStart().startsWith('[[mc:')) return null;

      const msg: OpenClawUiMessage = {
        role,
        text,
        timestamp: Number.isFinite(ts) ? ts : Date.now(),
      };

      return msg;
    })
    .filter((m): m is OpenClawUiMessage => !!m && m.text.trim().length > 0);

  return { messages };
}

function wrapMcUserMessage(message: string): string {
  const trimmed = message.trimStart();
  if (trimmed.startsWith('[[mc:')) return message;

  // Guardrail: never show chain-of-thought / reasoning meta in the UI.
  // This is stored in the gateway transcript as a user message, but MC hides [[mc:...]] entries.
  return `[[mc:guard]]\nDo not output your reasoning. Do not prefix with \"Reasoning:\".\nReply with just the answer.\n\n${message}`;
}

export async function openclawChatSend(params: {
  tenantId: number;
  convId?: string | null;
  message: string;
  idempotencyKey: string;
}): Promise<{ runId: string; status: string }> {
  const sessionKey = sessionKeyForTenant(params.tenantId, params.convId);

  const payload = (await openclawGatewayCall(
    'chat.send',
    {
      sessionKey,
      message: wrapMcUserMessage(params.message),
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
