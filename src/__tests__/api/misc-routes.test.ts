import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
  getTenantId: jest.fn(),
}));

jest.mock('@/lib/billing', () => ({
  getTenantSubscription: jest.fn(),
}));

jest.mock('@/lib/aipipe', () => ({
  aipipeStats: jest.fn(),
  aipipeTenantStats: jest.fn(),
  estimateSavingsPercent: jest.fn(),
}));

import { db } from '@/lib/db';
import { resolveTenantId, getTenantId } from '@/lib/tenant';
import { getTenantSubscription } from '@/lib/billing';
import { aipipeStats, aipipeTenantStats, estimateSavingsPercent } from '@/lib/aipipe';

import { GET as wsTokenGet } from '@/app/api/chat/ws-token/route';
import { GET as billingStatusGet } from '@/app/api/billing/status/route';
import { GET as aipipeStatsGet } from '@/app/api/aipipe/stats/route';
import { DELETE as gatewayDelete } from '@/app/api/gateway/[id]/route';

type MockDb = {
  select: jest.Mock;
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
const mockedGetTenantSubscription = getTenantSubscription as jest.MockedFunction<typeof getTenantSubscription>;
const mockedAipipeStats = aipipeStats as jest.MockedFunction<typeof aipipeStats>;
const mockedAipipeTenantStats = aipipeTenantStats as jest.MockedFunction<typeof aipipeTenantStats>;
const mockedEstimateSavingsPercent = estimateSavingsPercent as jest.MockedFunction<typeof estimateSavingsPercent>;

function makeRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const headers = new Headers(opts.headers ?? {});
  const hasBody = opts.body !== undefined;

  if (hasBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

function createSelectWhereLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

describe('misc API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chat/ws-token route', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await wsTokenGet(makeRequest('http://localhost/api/chat/ws-token'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns a token for an authenticated tenant', async () => {
      process.env.API_SECRET = 'test-api-secret';
      mockedResolveTenantId.mockResolvedValueOnce(7);

      const res = await wsTokenGet(makeRequest('http://localhost/api/chat/ws-token'));
      const payload = await res.json();

      expect(res.status).toBe(200);
      expect(typeof payload.token).toBe('string');
      expect(payload.token.length).toBeGreaterThan(10);
    });
  });

  describe('billing/status route', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedGetTenantId.mockReturnValueOnce(null);

      const res = await billingStatusGet(makeRequest('http://localhost/api/billing/status'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedGetTenantSubscription).not.toHaveBeenCalled();
    });

    it('returns subscription details for an authenticated tenant', async () => {
      const subscription = {
        tenantId: 3,
        plan: 'team' as const,
        status: 'active' as const,
        seats: 8,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
      };
      mockedGetTenantId.mockReturnValueOnce(3);
      mockedGetTenantSubscription.mockResolvedValueOnce(subscription);

      const res = await billingStatusGet(makeRequest('http://localhost/api/billing/status'));
      const payload = await res.json();

      expect(res.status).toBe(200);
      expect(payload).toEqual({
        tenantId: 3,
        plan: 'team',
        status: 'active',
        seats: 8,
        currentPeriodEnd: '2026-06-01T00:00:00.000Z',
      });
    });
  });

  describe('aipipe/stats route', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await aipipeStatsGet(makeRequest('http://localhost/api/aipipe/stats'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedAipipeStats).not.toHaveBeenCalled();
      expect(mockedAipipeTenantStats).not.toHaveBeenCalled();
    });

    it('returns combined global and tenant stats for authenticated tenant', async () => {
      const stats = {
        runtime: {
          latency_p50_ms: 12,
          latency_p95_ms: 42,
          latency_p99_ms: 88,
          ttft_p50_ms: 10,
          ttft_p95_ms: 33,
          ttft_p99_ms: 66,
          providers: [],
          models: [],
        },
        model_tracking: [],
        queue_depth: 1,
        queue_capacity: 100,
      };
      const tenantStats = {
        tenant_id: '17',
        requests: 9,
        in_tokens: 100,
        out_tokens: 200,
        cost_usd: 0.02,
        updated_at: '2026-02-01T00:00:00.000Z',
      };

      mockedResolveTenantId.mockResolvedValueOnce(17);
      mockedAipipeStats.mockResolvedValueOnce(stats);
      mockedAipipeTenantStats.mockResolvedValueOnce(tenantStats);
      mockedEstimateSavingsPercent.mockReturnValueOnce(23.5);

      const res = await aipipeStatsGet(makeRequest('http://localhost/api/aipipe/stats'));
      const payload = await res.json();

      expect(res.status).toBe(200);
      expect(payload).toEqual({
        ...stats,
        savingsPercent: 23.5,
        tenant: tenantStats,
      });
      expect(mockedAipipeTenantStats).toHaveBeenCalledWith('17');
    });

    it('returns 503 when AiPipe stats fetch fails', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(17);
      mockedAipipeStats.mockRejectedValueOnce(new Error('down'));

      const res = await aipipeStatsGet(makeRequest('http://localhost/api/aipipe/stats'));

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ error: 'AiPipe unavailable' });
    });
  });

  describe('gateway/[id] route', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await gatewayDelete(
        makeRequest('http://localhost/api/gateway/12', { method: 'DELETE' }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('returns 400 for non-numeric gateway id', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(5);

      const res = await gatewayDelete(
        makeRequest('http://localhost/api/gateway/abc', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'abc' }) },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid id' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('returns 404 when gateway does not exist for tenant', async () => {
      const selectBuilder = createSelectWhereLimitBuilder([]);
      mockedResolveTenantId.mockResolvedValueOnce(5);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await gatewayDelete(
        makeRequest('http://localhost/api/gateway/12', { method: 'DELETE' }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'Gateway not found' });
    });

    it('deletes gateway when id is valid and row exists', async () => {
      const selectBuilder = createSelectWhereLimitBuilder([{ id: 12 }]);
      const deleteWhere = jest.fn().mockResolvedValue(undefined);
      mockedResolveTenantId.mockResolvedValueOnce(5);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
      mockedDb.delete.mockReturnValueOnce({ where: deleteWhere });

      const res = await gatewayDelete(
        makeRequest('http://localhost/api/gateway/12', { method: 'DELETE' }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(mockedDb.delete).toHaveBeenCalledTimes(1);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });
  });
});
