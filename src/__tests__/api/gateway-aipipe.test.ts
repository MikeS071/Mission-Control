import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

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

jest.mock('@/lib/policy', () => ({
  getOrCreatePolicy: jest.fn(),
  isFeatureEnabled: jest.fn(),
  isModelAllowedForPolicy: jest.fn(),
  filterModelsForPolicy: jest.fn(),
}));

import {
  filterModelsForPolicy,
  getOrCreatePolicy,
  isFeatureEnabled,
  isModelAllowedForPolicy,
} from '@/lib/policy';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type JsonRequestOptions = {
  headers?: Record<string, string>;
  body?: unknown;
  rejectJson?: boolean;
};

type RouteContext = { params: Promise<{ id: string }> };

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedGetOrCreatePolicy = getOrCreatePolicy as jest.MockedFunction<typeof getOrCreatePolicy>;
const mockedIsFeatureEnabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>;
const mockedIsModelAllowedForPolicy = isModelAllowedForPolicy as jest.MockedFunction<typeof isModelAllowedForPolicy>;
const mockedFilterModelsForPolicy = filterModelsForPolicy as jest.MockedFunction<typeof filterModelsForPolicy>;

let gatewayGet: (req: NextRequest) => Promise<Response>;
let gatewayPost: (req: NextRequest) => Promise<Response>;
let gatewayDelete: (req: NextRequest, context: RouteContext) => Promise<Response>;
let gatewayCheckPost: (req: NextRequest, context: RouteContext) => Promise<Response>;
let chatProxyPost: (req: NextRequest) => Promise<Response>;
let messagesProxyPost: (req: NextRequest) => Promise<Response>;
let aipipeHealthGet: (req: NextRequest) => Promise<Response>;
let aipipeStatsGet: (req: NextRequest) => Promise<Response>;

function createRequest(options: JsonRequestOptions = {}): NextRequest {
  const headerMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headerMap[key.toLowerCase()] = value;
  }

  return {
    headers: {
      get: (key: string) => headerMap[key.toLowerCase()] ?? null,
    },
    json: jest.fn().mockImplementation(() => (
      options.rejectJson ? Promise.reject(new Error('invalid json')) : Promise.resolve(options.body)
    )),
  } as unknown as NextRequest;
}

function routeParams(id: string): RouteContext {
  return { params: Promise.resolve({ id }) };
}

function mockSelectWithOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, orderBy };
}

function mockSelectWithLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockInsertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

function mockUpdateReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set });
  return { set, where, returning };
}

function mockDeleteWhere() {
  const where = jest.fn().mockResolvedValue(undefined);
  mockedDb.delete.mockReturnValueOnce({ where });
  return { where };
}

describe('gateway + aipipe API routes', () => {
  beforeAll(async () => {
    process.env.AIPIPE_URL = 'http://aipipe.local';
    process.env.AIPIPE_ADMIN_SECRET = 'admin-secret';

    ({ GET: gatewayGet, POST: gatewayPost } = await import('@/app/api/gateway/route'));
    ({ DELETE: gatewayDelete } = await import('@/app/api/gateway/[id]/route'));
    ({ POST: gatewayCheckPost } = await import('@/app/api/gateway/[id]/check/route'));
    ({ POST: chatProxyPost } = await import('@/app/api/aipipe/proxy/chat/route'));
    ({ POST: messagesProxyPost } = await import('@/app/api/aipipe/proxy/messages/route'));
    ({ GET: aipipeHealthGet } = await import('@/app/api/aipipe/health/route'));
    ({ GET: aipipeStatsGet } = await import('@/app/api/aipipe/stats/route'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
    mockedAuth.mockResolvedValue(null);
    mockedGetOrCreatePolicy.mockResolvedValue({
      tier: 'free',
      limits: { api_calls_per_day: 100, agents: 1 },
      features: { models: true },
    });
    mockedIsFeatureEnabled.mockReturnValue(true);
    mockedIsModelAllowedForPolicy.mockImplementation((policy, model) => (
      policy.tier === 'pro' ? true : model.toLowerCase() === 'gpt-4o-mini'
    ));
    mockedFilterModelsForPolicy.mockImplementation((policy, models) => (
      policy.tier === 'pro' ? models : models.filter((m) => m.model === 'gpt-4o-mini')
    ));
  });

  it('forwards chat proxy requests to AiPipe with tenant header', async () => {
    const upstream = new Response(JSON.stringify({ id: 'chat-1' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch.mockResolvedValueOnce(upstream);

    const payload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.4,
    };
    const req = createRequest({ headers: { 'x-tenant-id': '42' }, body: payload });

    const res = await chatProxyPost(req);
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ id: 'chat-1' });
    expect(mockedFetch).toHaveBeenCalledWith(
      'http://aipipe.local/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Tenant-ID': '42',
        }),
      }),
    );
  });

  it('forwards anthropic messages proxy requests to AiPipe', async () => {
    const upstream = new Response(JSON.stringify({ id: 'msg-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch.mockResolvedValueOnce(upstream);

    const payload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'status report' }],
      max_tokens: 200,
    };
    const req = createRequest({ headers: { 'x-tenant-id': '7' }, body: payload });

    const res = await messagesProxyPost(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'msg-1' });
    expect(mockedFetch).toHaveBeenCalledWith(
      'http://aipipe.local/v1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Tenant-ID': '7',
        }),
      }),
    );
  });

  it('blocks unauthorized chat proxy requests', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    const req = createRequest({
      body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
    });

    const res = await chatProxyPost(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedAuth).toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed chat proxy payloads', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    const req = createRequest({
      headers: { 'x-tenant-id': '42' },
      body: { model: 'gpt-4o-mini', messages: [] },
    });

    const res = await chatProxyPost(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/messages/i) }),
    );
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('blocks premium model selection for free tier tenants', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedGetOrCreatePolicy.mockResolvedValueOnce({
      tier: 'free',
      limits: { api_calls_per_day: 100, agents: 1 },
      features: { models: true },
    });

    const req = createRequest({
      headers: { 'x-tenant-id': '42' },
      body: { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'hello' }] },
    });

    const res = await chatProxyPost(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/model|tier|upgrade/i),
        upgradePrompt: expect.any(String),
      }),
    );
    expect(mockedIsFeatureEnabled).toHaveBeenCalledWith(expect.any(Object), 'models');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns AiPipe health status for authorized tenants', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const req = createRequest({ headers: { 'x-tenant-id': '9' } });
    const res = await aipipeHealthGet(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
    expect(mockedFetch).toHaveBeenCalledWith(
      'http://aipipe.local/healthz',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('aggregates AiPipe stats with savings and tenant overlay', async () => {
    const statsPayload = {
      runtime: {
        latency_p50_ms: 40,
        latency_p95_ms: 80,
        latency_p99_ms: 120,
        ttft_p50_ms: 30,
        ttft_p95_ms: 60,
        ttft_p99_ms: 90,
        providers: [
          {
            provider: 'openai',
            requests: 100,
            success: 99,
            errors: 1,
            cache_hits: 0,
            input_tokens: 50_000,
            output_tokens: 10_000,
            streaming_calls: 0,
            total_cost_usd: 0.12,
          },
        ],
        models: [
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            requests: 100,
            success: 99,
            errors: 1,
            input_tokens: 50_000,
            output_tokens: 10_000,
            total_cost_usd: 0.12,
          },
        ],
      },
      model_tracking: [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 100,
          success_rate: 0.99,
          penalty: 0,
          total_cost_usd: 0.12,
          effective_success_rate: 0.99,
        },
      ],
      queue_depth: 0,
      queue_capacity: 100,
    };
    const tenantPayload = {
      tenant_id: '9',
      requests: 28,
      in_tokens: 14_000,
      out_tokens: 2_800,
      cost_usd: 0.04,
      updated_at: '2026-03-01T00:00:00.000Z',
    };

    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statsPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tenantPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const req = createRequest({ headers: { 'x-tenant-id': '9' } });
    const res = await aipipeStatsGet(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runtime.models).toHaveLength(1);
    expect(body.tenant).toEqual(tenantPayload);
    expect(body.savingsPercent).toBeGreaterThan(0);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'http://aipipe.local/v1/stats',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'http://aipipe.local/v1/tenants/9/stats',
      expect.objectContaining({
        headers: { 'X-Admin-Secret': 'admin-secret' },
      }),
    );
  });

  it('filters premium models from AiPipe stats for free tier tenants', async () => {
    mockedGetOrCreatePolicy.mockResolvedValueOnce({
      tier: 'free',
      limits: { api_calls_per_day: 100, agents: 1 },
      features: { models: true },
    });

    const statsPayload = {
      runtime: {
        latency_p50_ms: 40,
        latency_p95_ms: 80,
        latency_p99_ms: 120,
        ttft_p50_ms: 30,
        ttft_p95_ms: 60,
        ttft_p99_ms: 90,
        providers: [],
        models: [
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            requests: 100,
            success: 99,
            errors: 1,
            input_tokens: 50_000,
            output_tokens: 10_000,
            total_cost_usd: 0.12,
          },
          {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
            requests: 20,
            success: 20,
            errors: 0,
            input_tokens: 5_000,
            output_tokens: 800,
            total_cost_usd: 0.08,
          },
        ],
      },
      model_tracking: [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          requests: 100,
          success_rate: 0.99,
          penalty: 0,
          total_cost_usd: 0.12,
          effective_success_rate: 0.99,
        },
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          requests: 20,
          success_rate: 1,
          penalty: 0,
          total_cost_usd: 0.08,
          effective_success_rate: 1,
        },
      ],
      queue_depth: 0,
      queue_capacity: 100,
    };

    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statsPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tenant_id: '9', requests: 1, in_tokens: 1, out_tokens: 1, cost_usd: 0, updated_at: '2026-03-01T00:00:00.000Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const req = createRequest({ headers: { 'x-tenant-id': '9' } });
    const res = await aipipeStatsGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.runtime.models.map((m: { model: string }) => m.model)).toEqual(['gpt-4o-mini']);
    expect(body.model_tracking.map((m: { model: string }) => m.model)).toEqual(['gpt-4o-mini']);
    expect(mockedIsFeatureEnabled).toHaveBeenCalledWith(expect.any(Object), 'models');
  });

  it('lists gateway configs for a tenant', async () => {
    const rows = [
      {
        id: 1,
        tenantId: 77,
        label: 'Primary',
        url: 'https://gw.example.com/health',
        status: 'ok',
        lastCheckedAt: new Date('2026-03-01T01:00:00.000Z'),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ];
    mockSelectWithOrderBy(rows);

    const req = createRequest({ headers: { 'x-tenant-id': '77' } });
    const res = await gatewayGet(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        ...rows[0],
        createdAt: '2026-03-01T00:00:00.000Z',
        lastCheckedAt: '2026-03-01T01:00:00.000Z',
      },
    ]);
    expect(mockedDb.select).toHaveBeenCalledTimes(1);
  });

  it('creates gateway config and stores health status + token hash', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ healthy: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const created = {
      id: 3,
      tenantId: 77,
      label: 'Primary Gateway',
      url: 'https://gw.example.com/health',
      status: 'ok',
      lastCheckedAt: new Date('2026-03-01T01:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    };
    const { values } = mockInsertReturning([created]);

    const req = createRequest({
      headers: { 'x-tenant-id': '77' },
      body: {
        label: 'Primary Gateway',
        url: 'https://gw.example.com/health',
        token: '  super-secret  ',
      },
    });
    const res = await gatewayPost(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ...created,
      createdAt: '2026-03-01T00:00:00.000Z',
      lastCheckedAt: '2026-03-01T01:00:00.000Z',
      check: { status: 'ok', info: { healthy: true } },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 77,
        label: 'Primary Gateway',
        url: 'https://gw.example.com/health',
        status: 'ok',
        tokenHash: createHash('sha256').update('super-secret').digest('hex'),
      }),
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://gw.example.com/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer super-secret' }),
      }),
    );
  });

  it('runs gateway connect check and persists updated status', async () => {
    mockSelectWithLimit([
      {
        id: 9,
        tenantId: 77,
        url: 'https://gw.example.com/health',
      },
    ]);
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'down' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const updated = {
      id: 9,
      tenantId: 77,
      label: 'Primary',
      url: 'https://gw.example.com/health',
      status: 'error',
      lastCheckedAt: new Date('2026-03-01T02:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    };
    const { set } = mockUpdateReturning([updated]);

    const req = createRequest({
      headers: { 'x-tenant-id': '77' },
      body: { token: '  override-token  ' },
    });
    const res = await gatewayCheckPost(req, routeParams('9'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ...updated,
      createdAt: '2026-03-01T00:00:00.000Z',
      lastCheckedAt: '2026-03-01T02:00:00.000Z',
      check: { status: 'error', info: { detail: 'down' } },
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        lastCheckedAt: expect.any(Date),
      }),
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://gw.example.com/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer override-token' }),
      }),
    );
  });

  it('deletes existing gateway configs', async () => {
    mockSelectWithLimit([{ id: 9 }]);
    const { where } = mockDeleteWhere();

    const req = createRequest({ headers: { 'x-tenant-id': '77' } });
    const res = await gatewayDelete(req, routeParams('9'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(where).toHaveBeenCalled();
  });

  it('returns 400 for malformed gateway create payloads', async () => {
    const mockedFetch = global.fetch as unknown as jest.MockedFunction<typeof fetch>;
    const req = createRequest({
      headers: { 'x-tenant-id': '77' },
      body: { label: 'Broken', url: 'not-a-url' },
    });

    const res = await gatewayPost(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/url/i) }),
    );
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
