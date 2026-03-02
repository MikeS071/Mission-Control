import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { GET as adminTenantsGet } from '@/app/api/admin/tenants/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

function makeRequest(url = 'http://localhost/api/admin/tenants'): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

function selectOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy };
}

function selectInnerJoinGroupBy(rows: unknown[]) {
  const groupBy = jest.fn().mockResolvedValue(rows);
  const innerJoin = jest.fn().mockReturnValue({ groupBy });
  const from = jest.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, groupBy };
}

describe('admin tenants API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns tenant list with user counts', async () => {
    const tenantRows = [
      {
        id: 2,
        name: 'Alpha',
        slug: 'alpha',
        plan: 'pro',
        createdAt: new Date('2026-02-10T10:00:00.000Z'),
      },
      {
        id: 3,
        name: 'Beta',
        slug: 'beta',
        plan: 'free',
        createdAt: new Date('2026-02-11T10:00:00.000Z'),
      },
    ];
    const countRows = [{ tenantId: 2, userCount: '4' }];
    const tenantsLookup = selectOrderBy(tenantRows);
    const countsLookup = selectInnerJoinGroupBy(countRows);

    mockedDb.select
      .mockReturnValueOnce({ from: tenantsLookup.from })
      .mockReturnValueOnce({ from: countsLookup.from });

    const res = await adminTenantsGet(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      {
        id: 2,
        name: 'Alpha',
        slug: 'alpha',
        plan: 'pro',
        createdAt: '2026-02-10T10:00:00.000Z',
        userCount: 4,
      },
      {
        id: 3,
        name: 'Beta',
        slug: 'beta',
        plan: 'free',
        createdAt: '2026-02-11T10:00:00.000Z',
        userCount: 0,
      },
    ]);
    expect(tenantsLookup.orderBy).toHaveBeenCalled();
    expect(countsLookup.innerJoin).toHaveBeenCalled();
    expect(countsLookup.groupBy).toHaveBeenCalled();
  });

  it('GET without session returns 401', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await adminTenantsGet(makeRequest());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('GET with non-admin session returns 403', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@tenant.dev' }, tenantId: 7 } as unknown);

    const res = await adminTenantsGet(makeRequest());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});
