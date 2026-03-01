import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

process.env.MC_INBOUND_SECRET = process.env.MC_INBOUND_SECRET ?? 'relay-secret';
process.env.OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? 'gateway-token';
process.env.API_SECRET = process.env.API_SECRET ?? 'api-secret';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/ws-manager', () => ({
  wsManager: {
    broadcast: jest.fn(),
    createToken: jest.fn(),
  },
}));

jest.mock('@/lib/chat-threads', () => ({
  resolveThreadId: jest.fn(),
  bumpThreadUpdatedAt: jest.fn(),
}));

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { wsManager } from '@/lib/ws-manager';
import { bumpThreadUpdatedAt, resolveThreadId } from '@/lib/chat-threads';
import { POST as chatPost } from '@/app/api/chat/route';
import { GET as historyGet } from '@/app/api/chat/history/route';
import { POST as inboundPost } from '@/app/api/chat/inbound/route';
import { GET as streamGet } from '@/app/api/chat/stream/route';
import { POST as gatewayPost } from '@/app/api/chat/gateway/route';
import { GET as threadsGet, POST as threadsPost } from '@/app/api/chat/threads/route';
import { PATCH as threadPatch, DELETE as threadDelete } from '@/app/api/chat/threads/[id]/route';
import { GET as wsTokenGet } from '@/app/api/chat/ws-token/route';

type MockedDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockedDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedWsManager = wsManager as unknown as { broadcast: jest.Mock; createToken: jest.Mock };
const mockedResolveThreadId = resolveThreadId as jest.MockedFunction<typeof resolveThreadId>;
const mockedBumpThreadUpdatedAt = bumpThreadUpdatedAt as jest.MockedFunction<typeof bumpThreadUpdatedAt>;

function req(
  url: string,
  opts: { method?: string; tenantId?: number; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.tenantId) headers['x-tenant-id'] = String(opts.tenantId);
  const hasBody = opts.body !== undefined;
  if (hasBody && !headers['content-type']) headers['content-type'] = 'application/json';

  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

function mockInsertReturningOnce(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

function mockSelectWithLimitOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy, limit });
  const from = jest.fn().mockReturnValue({ where, orderBy, limit });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, orderBy, limit };
}

function mockSelectOrderByOnce(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where, orderBy });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, orderBy };
}

function mockUpdateReturningOnce(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set });
  return { set, where, returning };
}

function mockDeleteWhereOnce(value?: unknown) {
  const where = jest.fn().mockResolvedValue(value);
  mockedDb.delete.mockReturnValueOnce({ where });
  return { where };
}

function routeFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack = [''];

  while (stack.length) {
    const rel = stack.pop()!;
    const abs = join(rootDir, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push(nextRel);
      if (entry.isFile() && entry.name === 'route.ts') out.push(nextRel);
    }
  }

  return out.sort();
}

describe('chat API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue(null);
    mockedResolveThreadId.mockResolvedValue(777);
    mockedBumpThreadUpdatedAt.mockResolvedValue(undefined);
    mockedWsManager.createToken.mockReturnValue('ws-token');
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('lists all chat route files from src/app/api/chat', () => {
    const files = routeFiles(join(process.cwd(), 'src/app/api/chat'));
    expect(files).toEqual([
      'gateway/route.ts',
      'history/route.ts',
      'inbound/route.ts',
      'route.ts',
      'stream/route.ts',
      'threads/[id]/route.ts',
      'threads/route.ts',
      'ws-token/route.ts',
    ]);
  });

  it('POST /api/chat returns 401 when unauthenticated', async () => {
    const res = await chatPost(req('http://localhost/api/chat', { body: { message: 'hello' } }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('POST /api/chat sends message and returns assistant reply', async () => {
    mockInsertReturningOnce([{ id: 101 }]);
    mockSelectWithLimitOnce([
      { id: 101, role: 'user', content: 'hello' },
      { id: 100, role: 'assistant', content: 'older-reply' },
      { id: 99, role: 'user', content: 'older-question' },
    ]);
    mockInsertReturningOnce([{ id: 102 }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'assistant response' } }] }),
    });

    const res = await chatPost(req('http://localhost/api/chat', { tenantId: 42, body: { message: ' hello ', threadId: 9 } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ reply: 'assistant response', messageId: 102, threadId: 777 });
    expect(mockedResolveThreadId).toHaveBeenCalledWith(42, 9);
    expect(mockedWsManager.broadcast).toHaveBeenCalledTimes(2);
    expect(mockedWsManager.broadcast).toHaveBeenNthCalledWith(
      1,
      42,
      expect.objectContaining({ id: 101, role: 'user', content: 'hello', threadId: 777 })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Tenant-ID': '42' }),
      })
    );
  });

  it('POST /api/chat rejects invalid input', async () => {
    const res = await chatPost(req('http://localhost/api/chat', { tenantId: 4, body: { message: '' } }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'message is required and must be a non-empty string',
    });
  });

  it('POST /api/chat returns graceful error payload on upstream failure', async () => {
    mockInsertReturningOnce([{ id: 10 }]);
    mockSelectWithLimitOnce([]);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('upstream down'));

    const res = await chatPost(req('http://localhost/api/chat', { tenantId: 8, body: { message: 'hi' } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      reply: 'Agent unavailable — check your AiPipe configuration.',
      error: true,
    });
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
  });

  it('GET /api/chat/history returns 401 when unauthenticated', async () => {
    const res = await historyGet(req('http://localhost/api/chat/history?limit=10'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('GET /api/chat/history supports beforeId pagination and limit clamping', async () => {
    const selectMock = mockSelectWithLimitOnce([
      { id: 119, role: 'assistant', content: 'newer', createdAt: new Date('2026-01-02T00:00:00Z') },
      { id: 118, role: 'user', content: 'older', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = await historyGet(req('http://localhost/api/chat/history?limit=500&beforeId=120&threadId=44', { tenantId: 3 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockedResolveThreadId).toHaveBeenCalledWith(3, '44');
    expect(selectMock.limit).toHaveBeenCalledWith(200);
    expect(json.messages.map((m: { id: number }) => m.id)).toEqual([118, 119]);
  });

  it('GET /api/chat/threads lists tenant threads', async () => {
    mockSelectOrderByOnce([
      { id: 4, title: 'A', updatedAt: new Date('2026-01-04T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: 3, title: 'B', updatedAt: new Date('2026-01-03T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = await threadsGet(req('http://localhost/api/chat/threads', { tenantId: 9 }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      threads: expect.arrayContaining([
        expect.objectContaining({ id: 4, title: 'A' }),
        expect.objectContaining({ id: 3, title: 'B' }),
      ]),
    });
  });

  it('POST /api/chat/threads creates a thread and defaults title when missing', async () => {
    const insertMock = mockInsertReturningOnce([
      { id: 55, title: 'New thread', updatedAt: new Date('2026-01-01T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = await threadsPost(req('http://localhost/api/chat/threads', { tenantId: 6, body: {} }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(insertMock.values).toHaveBeenCalledWith({ tenantId: 6, title: 'New thread' });
    expect(json.thread).toEqual(expect.objectContaining({ id: 55, title: 'New thread' }));
  });

  it('PATCH /api/chat/threads/[id] validates thread id', async () => {
    const res = await threadPatch(
      req('http://localhost/api/chat/threads/abc', { tenantId: 1, body: { title: 'X' } }),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid id' });
  });

  it('PATCH /api/chat/threads/[id] updates title', async () => {
    mockUpdateReturningOnce([
      { id: 7, title: 'Renamed', updatedAt: new Date('2026-01-02T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = await threadPatch(
      req('http://localhost/api/chat/threads/7', { tenantId: 1, body: { title: '  Renamed ' } }),
      { params: Promise.resolve({ id: '7' }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      thread: expect.objectContaining({ id: 7, title: 'Renamed' }),
    });
  });

  it('DELETE /api/chat/threads/[id] returns not found for foreign thread', async () => {
    mockSelectWithLimitOnce([]);

    const res = await threadDelete(
      req('http://localhost/api/chat/threads/99', { tenantId: 2 }),
      { params: Promise.resolve({ id: '99' }) }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('DELETE /api/chat/threads/[id] cascades message+thread deletes', async () => {
    mockSelectWithLimitOnce([{ id: 15 }]);
    mockDeleteWhereOnce();
    mockDeleteWhereOnce();

    const res = await threadDelete(
      req('http://localhost/api/chat/threads/15', { tenantId: 12 }),
      { params: Promise.resolve({ id: '15' }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it('POST /api/chat/inbound enforces relay secret and validation', async () => {
    const unauthorized = await inboundPost(
      req('http://localhost/api/chat/inbound', {
        body: { tenantId: 1, role: 'user', content: 'hello' },
        headers: { 'x-relay-secret': 'wrong' },
      })
    );
    expect(unauthorized.status).toBe(401);

    const invalid = await inboundPost(
      req('http://localhost/api/chat/inbound', {
        body: { tenantId: 'x', role: 'user', content: 'hello' },
        headers: { 'x-relay-secret': 'relay-secret' },
      })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'tenantId must be an integer' });
  });

  it('POST /api/chat/inbound handles duplicate relay idempotently', async () => {
    const returning = jest.fn().mockRejectedValue({ code: '23505' });
    const values = jest.fn().mockReturnValue({ returning });
    mockedDb.insert.mockReturnValueOnce({ values });

    const res = await inboundPost(
      req('http://localhost/api/chat/inbound', {
        body: { tenantId: 11, role: 'assistant', content: 'dupe', source: 'telegram', externalId: 998 },
        headers: { 'x-relay-secret': 'relay-secret' },
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, duplicate: true });
  });

  it('GET /api/chat/ws-token returns token for authenticated user', async () => {
    mockedWsManager.createToken.mockReturnValue('signed-token');

    const res = await wsTokenGet(req('http://localhost/api/chat/ws-token', { tenantId: 17 }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ token: 'signed-token' });
    expect(mockedWsManager.createToken).toHaveBeenCalledWith(17);
  });

  it('GET /api/chat/stream returns SSE response with message events', async () => {
    mockSelectWithLimitOnce([
      { id: 1, role: 'assistant', content: 'stream-msg', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => 0 as unknown as NodeJS.Timeout);

    const res = await streamGet(req('http://localhost/api/chat/stream?threadId=2', { tenantId: 5 }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const reader = res.body!.getReader();
    const firstChunk = await reader.read();
    await reader.cancel();
    timeoutSpy.mockRestore();

    const text = new TextDecoder().decode(firstChunk.value ?? new Uint8Array());
    expect(text).toContain('data: ');
    expect(text).toContain('"threadId":777');
    expect(text).toContain('"content":"stream-msg"');
  });

  it('POST /api/chat/gateway persists user+assistant messages', async () => {
    mockedResolveThreadId.mockResolvedValue(88);
    mockInsertReturningOnce([{ id: 300 }]);
    mockSelectWithLimitOnce([{ role: 'user', content: 'hello' }]);
    mockInsertReturningOnce([{ id: 301 }]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'gateway reply' } }] }),
    });

    const res = await gatewayPost(
      req('http://localhost/api/chat/gateway', { tenantId: 20, body: { message: 'hello', threadId: 88 } })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      reply: 'gateway reply',
      userMessageId: 300,
      messageId: 301,
      threadId: 88,
    });
    expect(mockedWsManager.broadcast).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer\s+\S+/),
        }),
      })
    );
  });
});
