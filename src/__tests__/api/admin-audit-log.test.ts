import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { listPolicyAuditLogs } from '@/lib/admin/audit-log';
import { GET as adminAuditLogGet } from '@/app/api/admin/audit-log/route';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/admin/audit-log', () => ({
  listPolicyAuditLogs: jest.fn(),
}));

const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedListPolicyAuditLogs = listPolicyAuditLogs as unknown as jest.MockedFunction<typeof listPolicyAuditLogs>;

function makeRequest(url = 'http://localhost/api/admin/audit-log'): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

describe('admin audit log API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns paginated policy audit rows', async () => {
    mockedListPolicyAuditLogs.mockResolvedValueOnce({
      items: [
        {
          id: 17,
          tenantId: 4,
          tenantName: 'Acme',
          changedBy: 'owner@acme.dev',
          reason: 'Raised monthly token cap',
          oldRules: { limits: { max_tokens_month: 500000 } },
          newRules: { limits: { max_tokens_month: 750000 } },
          diffSummary: '1 changed, 0 added, 0 removed (limits.max_tokens_month)',
          timestamp: '2026-03-01T08:10:00.000Z',
        },
      ],
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });

    const res = await adminAuditLogGet(
      makeRequest('http://localhost/api/admin/audit-log?tenantId=4&page=2&limit=10'),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockedListPolicyAuditLogs).toHaveBeenCalledWith({ tenantId: 4, page: 2, limit: 10 });
    expect(data).toEqual({
      items: [
        {
          id: 17,
          tenantId: 4,
          tenantName: 'Acme',
          changedBy: 'owner@acme.dev',
          reason: 'Raised monthly token cap',
          oldRules: { limits: { max_tokens_month: 500000 } },
          newRules: { limits: { max_tokens_month: 750000 } },
          diffSummary: '1 changed, 0 added, 0 removed (limits.max_tokens_month)',
          timestamp: '2026-03-01T08:10:00.000Z',
        },
      ],
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it('GET returns 401 when session is missing', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await adminAuditLogGet(makeRequest());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedListPolicyAuditLogs).not.toHaveBeenCalled();
  });

  it('GET returns 403 when session is non-admin', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@tenant.dev' }, tenantId: 8 } as unknown);

    const res = await adminAuditLogGet(makeRequest());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedListPolicyAuditLogs).not.toHaveBeenCalled();
  });

  it('GET returns 400 for invalid pagination query', async () => {
    const res = await adminAuditLogGet(makeRequest('http://localhost/api/admin/audit-log?page=0&limit=nope'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid query params' });
    expect(mockedListPolicyAuditLogs).not.toHaveBeenCalled();
  });

  it('GET returns 500 when data layer throws', async () => {
    mockedListPolicyAuditLogs.mockRejectedValueOnce(new Error('db exploded'));

    const res = await adminAuditLogGet(makeRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'db exploded' });
  });
});
