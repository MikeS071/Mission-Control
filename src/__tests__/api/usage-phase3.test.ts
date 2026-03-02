import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { getOrCreatePolicy, isFeatureEnabled, isModelAllowedForPolicy } from '@/lib/policy';
import { getTenantPlan } from '@/lib/billing';
import { aipipeProxyChat } from '@/lib/aipipe';
import { checkBudget } from '@/lib/usage/budget';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/policy', () => ({
  getOrCreatePolicy: jest.fn(),
  isFeatureEnabled: jest.fn(),
  isModelAllowedForPolicy: jest.fn(),
}));

jest.mock('@/lib/billing', () => ({
  getTenantPlan: jest.fn(),
}));

jest.mock('@/lib/aipipe', () => ({
  aipipeProxyChat: jest.fn(),
  aipipeProxyMessages: jest.fn(),
}));

jest.mock('@/lib/usage/budget', () => ({
  checkBudget: jest.fn(),
}));

import { getTenantCost } from '@/lib/usage/pricing';
import { recordUsage } from '@/lib/usage/meter';
import { checkAlerts } from '@/lib/usage/alerts';
import { POST as chatProxyPost } from '@/app/api/aipipe/proxy/chat/route';
import { GET as usageSummaryGet } from '@/app/api/usage/summary/route';
import { GET as usageBreakdownGet } from '@/app/api/usage/breakdown/route';
import { GET as usageSavingsGet } from '@/app/api/usage/savings/route';

type MockDb = {
  execute: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  select: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedGetOrCreatePolicy = getOrCreatePolicy as jest.MockedFunction<typeof getOrCreatePolicy>;
const mockedIsFeatureEnabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>;
const mockedIsModelAllowedForPolicy = isModelAllowedForPolicy as jest.MockedFunction<typeof isModelAllowedForPolicy>;
const mockedGetTenantPlan = getTenantPlan as jest.MockedFunction<typeof getTenantPlan>;
const mockedAipipeProxyChat = aipipeProxyChat as jest.MockedFunction<typeof aipipeProxyChat>;
const mockedCheckBudget = checkBudget as jest.MockedFunction<typeof checkBudget>;

function makeRequest(url: string, method: 'GET' | 'POST' = 'GET', body?: unknown): NextRequest {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockInsertValuesResolved() {
  const values = jest.fn().mockResolvedValue(undefined);
  mockedDb.insert.mockReturnValueOnce({ values });
  return values;
}

describe('usage phase 3 verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
    mockedGetOrCreatePolicy.mockResolvedValue({
      tier: 'free',
      limits: { api_calls_per_day: 100, agents: 1 },
      features: { models: true },
    });
    mockedIsFeatureEnabled.mockReturnValue(true);
    mockedIsModelAllowedForPolicy.mockReturnValue(true);
    mockedGetTenantPlan.mockResolvedValue('free');
    mockedCheckBudget.mockResolvedValue({
      allowed: true,
      remaining: 42,
      limit: 100,
      period: 'daily',
      resetsAt: '2026-03-03T00:00:00.000Z',
    });
  });

  it('applies pricing markup by plan and model override', () => {
    expect(getTenantCost(1, 'gpt-4o-mini', 'free')).toBeCloseTo(1.3, 6);
    expect(getTenantCost(1, 'claude-3-5-sonnet', 'pro')).toBeCloseTo(1.2, 6);
    expect(getTenantCost(1, 'claude-3-5-sonnet', 'team')).toBeCloseTo(1, 6);
  });

  it('records usage ledger fields from AiPipe headers and computes tenant cost', async () => {
    const ledgerValues = mockInsertValuesResolved();
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const headers = new Headers({
      'X-AiPipe-Model': 'gpt-4o-mini',
      'X-AiPipe-Provider': 'openai',
      'X-AiPipe-Tokens-In': '120',
      'X-AiPipe-Tokens-Out': '40',
      'X-AiPipe-Cost-USD': '0.250000',
      'X-AiPipe-Hypothetical-Cost-USD': '0.400000',
      'X-AiPipe-Saved-USD': '0.150000',
      'X-AiPipe-Cache': 'hit',
      'X-AiPipe-Request-Id': 'req_123',
    });

    await recordUsage(7, headers);

    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    const payload = ledgerValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        tenantId: 7,
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensIn: 120,
        tokensOut: 40,
        cacheHit: true,
        requestId: 'req_123',
      }),
    );
    expect(Number(payload.costUsd)).toBeCloseTo(0.25, 6);
    expect(Number(payload.tenantCostUsd)).toBeCloseTo(0.325, 6);
  });

  it('returns 429 from chat proxy when budget is exceeded', async () => {
    mockedCheckBudget.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 5,
      period: 'daily',
      resetsAt: '2026-03-03T00:00:00.000Z',
    });

    const res = await chatProxyPost(
      makeRequest('http://localhost/api/aipipe/proxy/chat', 'POST', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: 'Budget exceeded',
        remaining: 0,
        limit: 5,
      }),
    );
    expect(res.headers.get('X-Budget-Remaining')).toBe('0');
    expect(res.headers.get('X-Budget-Limit')).toBe('5');
    expect(mockedAipipeProxyChat).not.toHaveBeenCalled();
  });

  it('returns usage dashboard aggregations from summary, breakdown, and savings APIs', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ period: 'daily', period_start: '2026-03-01T00:00:00.000Z', total_cost_usd: '1.250000', request_count: 10 }] })
      .mockResolvedValueOnce({ rows: [{ group_key: 'gpt-4o-mini', request_count: 10, tokens_in: '1000', tokens_out: '300', cost_usd: '1.250000' }] })
      .mockResolvedValueOnce({ rows: [{ total_cost_usd: '5.000000', total_saved_usd: '2.000000' }] });

    const summaryRes = await usageSummaryGet(makeRequest('http://localhost/api/usage/summary?period=daily'));
    const breakdownRes = await usageBreakdownGet(makeRequest('http://localhost/api/usage/breakdown?groupBy=model'));
    const savingsRes = await usageSavingsGet(makeRequest('http://localhost/api/usage/savings'));

    expect(summaryRes.status).toBe(200);
    await expect(summaryRes.json()).resolves.toEqual(
      expect.objectContaining({
        period: 'daily',
        items: expect.arrayContaining([expect.objectContaining({ requestCount: 10 })]),
      }),
    );

    expect(breakdownRes.status).toBe(200);
    await expect(breakdownRes.json()).resolves.toEqual(
      expect.objectContaining({
        groupBy: 'model',
        items: expect.arrayContaining([expect.objectContaining({ group: 'gpt-4o-mini', requestCount: 10 })]),
      }),
    );

    expect(savingsRes.status).toBe(200);
    await expect(savingsRes.json()).resolves.toEqual({
      totalCostUsd: '5.000000',
      totalSavedUsd: '2.000000',
      savingsPct: '40.00',
    });
  });

  it('fires threshold alerts once and avoids duplicates', async () => {
    mockedCheckBudget.mockResolvedValueOnce({
      allowed: true,
      remaining: 10,
      limit: 100,
      period: 'daily',
      resetsAt: '2026-03-03T00:00:00.000Z',
    });

    mockedDb.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1, alert_type: 'budget_critical', threshold: 90, message: 'x', acknowledged: false, created_at: '2026-03-02T12:00:00.000Z', tenant_id: 7 }] });

    const first = await checkAlerts(7);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ threshold: 90, alertType: 'budget_critical' });

    mockedCheckBudget.mockResolvedValueOnce({
      allowed: true,
      remaining: 5,
      limit: 100,
      period: 'daily',
      resetsAt: '2026-03-03T00:00:00.000Z',
    });

    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ threshold: 90 }] });

    const second = await checkAlerts(7);
    expect(second).toHaveLength(0);
  });
});
