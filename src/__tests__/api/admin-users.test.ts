import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { GET as adminUsersGet } from '@/app/api/admin/users/route';

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

function makeRequest(url: string): NextRequest {
  return new Request(url, { method: 'GET' }) as unknown as NextRequest;
}

function selectInnerJoinInnerJoinOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const secondInnerJoin = jest.fn().mockReturnValue({ orderBy });
  const firstInnerJoin = jest.fn().mockReturnValue({ innerJoin: secondInnerJoin });
  const from = jest.fn().mockReturnValue({ innerJoin: firstInnerJoin });
  return { from, firstInnerJoin, secondInnerJoin, orderBy };
}

describe('admin users API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns user list', async () => {
    const rows = [
      {
        id: 7,
        email: 'owner@tenant.dev',
        tenantId: 22,
        tenantName: 'Tenant 22',
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        lastLogin: new Date('2026-01-20T00:00:00.000Z'),
      },
    ];
    const selectBuilder = selectInnerJoinInnerJoinOrderBy(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await adminUsersGet(makeRequest('http://localhost/api/admin/users'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      {
        id: 7,
        email: 'owner@tenant.dev',
        tenantId: 22,
        tenantName: 'Tenant 22',
        createdAt: '2026-01-10T00:00:00.000Z',
        lastLogin: '2026-01-20T00:00:00.000Z',
      },
    ]);
    expect(selectBuilder.firstInnerJoin).toHaveBeenCalled();
    expect(selectBuilder.secondInnerJoin).toHaveBeenCalled();
    expect(selectBuilder.orderBy).toHaveBeenCalled();
  });

  it('GET without session returns 401', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await adminUsersGet(makeRequest('http://localhost/api/admin/users'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('GET with non-admin session returns 403', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@tenant.dev' }, tenantId: 4 } as unknown);

    const res = await adminUsersGet(makeRequest('http://localhost/api/admin/users'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});
