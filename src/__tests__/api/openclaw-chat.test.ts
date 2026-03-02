import { NextRequest } from 'next/server';

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/openclaw-chat', () => ({
  openclawChatSend: jest.fn(),
  openclawChatHistory: jest.fn(),
}));

import { resolveTenantId } from '@/lib/tenant';
import { openclawChatSend, openclawChatHistory } from '@/lib/openclaw-chat';
import { POST as sendPost } from '@/app/api/openclaw/chat/send/route';
import { GET as historyGet } from '@/app/api/openclaw/chat/history/route';

const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedOpenclawChatSend = openclawChatSend as jest.MockedFunction<typeof openclawChatSend>;
const mockedOpenclawChatHistory = openclawChatHistory as jest.MockedFunction<typeof openclawChatHistory>;

function req(
  url: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const hasBody = opts.body !== undefined;

  if (hasBody && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

describe('openclaw chat routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
  });

  it('POST /api/openclaw/chat/send sends message', async () => {
    mockedOpenclawChatSend.mockResolvedValue({ runId: 'run-1', status: 'queued' });

    const res = await sendPost(
      req('http://localhost/api/openclaw/chat/send', {
        body: { message: '  Hello OpenClaw  ', idempotencyKey: 'idem-12345678' },
        headers: { 'x-mc-conv-id': 'conv_123abc' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, runId: 'run-1', status: 'queued', idempotencyKey: 'idem-12345678' });
    expect(mockedOpenclawChatSend).toHaveBeenCalledWith({
      tenantId: 7,
      convId: 'conv_123abc',
      message: 'Hello OpenClaw',
      idempotencyKey: 'idem-12345678',
    });
  });

  it('GET /api/openclaw/chat/history returns chat history', async () => {
    const messages: Array<{ role: 'assistant' | 'user'; text: string; timestamp: number }> = [
      { role: 'assistant', text: 'Hi', timestamp: 1700000000000 },
    ];
    mockedOpenclawChatHistory.mockResolvedValue({ messages });

    const res = await historyGet(
      req('http://localhost/api/openclaw/chat/history?limit=120', {
        headers: { 'x-mc-conv-id': 'session_42' },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ messages });
    expect(mockedOpenclawChatHistory).toHaveBeenCalledWith({
      tenantId: 7,
      convId: 'session_42',
      limit: 120,
    });
  });

  it('POST /api/openclaw/chat/send returns 401 when auth is missing', async () => {
    mockedResolveTenantId.mockResolvedValueOnce(null);

    const res = await sendPost(req('http://localhost/api/openclaw/chat/send', { body: { message: 'hello' } }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedOpenclawChatSend).not.toHaveBeenCalled();
  });

  it('GET /api/openclaw/chat/history returns 401 when auth is missing', async () => {
    mockedResolveTenantId.mockResolvedValueOnce(null);

    const res = await historyGet(req('http://localhost/api/openclaw/chat/history'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedOpenclawChatHistory).not.toHaveBeenCalled();
  });

  it('POST /api/openclaw/chat/send validates empty message', async () => {
    const res = await sendPost(req('http://localhost/api/openclaw/chat/send', { body: { message: '' } }));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toMatchObject({ error: 'Invalid payload' });
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(mockedOpenclawChatSend).not.toHaveBeenCalled();
  });
});
