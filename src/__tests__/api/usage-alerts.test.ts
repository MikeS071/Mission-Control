import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

import { GET as getUsageAlerts } from '@/app/api/usage/alerts/route';
import { POST as acknowledgeUsageAlert } from '@/app/api/usage/alerts/[id]/ack/route';

type MockDb = {
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;

function makeRequest(method: 'GET' | 'POST', url: string): NextRequest {
  return new NextRequest(url, { method });
}

describe('usage alerts API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
  });

  it('GET /api/usage/alerts returns unacknowledged alerts for tenant', async () => {
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          tenant_id: 7,
          alert_type: 'budget_warning',
          threshold: 75,
          message: 'Usage is at 75% of monthly budget',
          acknowledged: false,
          created_at: new Date('2026-03-02T00:00:00.000Z'),
        },
      ],
    });

    const res = await getUsageAlerts(makeRequest('GET', 'http://localhost/api/usage/alerts'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      alerts: [
        {
          id: 1,
          tenantId: 7,
          alertType: 'budget_warning',
          threshold: 75,
          message: 'Usage is at 75% of monthly budget',
          acknowledged: false,
          createdAt: '2026-03-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('POST /api/usage/alerts/:id/ack acknowledges an alert', async () => {
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          tenant_id: 7,
          alert_type: 'budget_critical',
          threshold: 90,
          message: 'Usage is at 90% of monthly budget',
          acknowledged: true,
          created_at: new Date('2026-03-02T00:00:00.000Z'),
        },
      ],
    });

    const res = await acknowledgeUsageAlert(
      makeRequest('POST', 'http://localhost/api/usage/alerts/12/ack'),
      { params: Promise.resolve({ id: '12' }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      alert: {
        id: 12,
        tenantId: 7,
        alertType: 'budget_critical',
        threshold: 90,
        message: 'Usage is at 90% of monthly budget',
        acknowledged: true,
        createdAt: '2026-03-02T00:00:00.000Z',
      },
    });
  });

  it('POST /api/usage/alerts/:id/ack returns 404 for missing alert', async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [] });

    const res = await acknowledgeUsageAlert(
      makeRequest('POST', 'http://localhost/api/usage/alerts/99/ack'),
      { params: Promise.resolve({ id: '99' }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Alert not found' });
  });

  it('returns 401 when tenant is missing', async () => {
    mockedResolveTenantId.mockResolvedValue(null);

    const getRes = await getUsageAlerts(makeRequest('GET', 'http://localhost/api/usage/alerts'));
    const ackRes = await acknowledgeUsageAlert(
      makeRequest('POST', 'http://localhost/api/usage/alerts/12/ack'),
      { params: Promise.resolve({ id: '12' }) },
    );

    expect(getRes.status).toBe(401);
    await expect(getRes.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(ackRes.status).toBe(401);
    await expect(ackRes.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.execute).not.toHaveBeenCalled();
  });
});
