import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { createVPS, getVPSStatus } from '@/lib/provisioning';

import { POST as provisionCreatePost } from '@/app/api/admin/provision/route';
import { GET as provisionListGet } from '@/app/api/admin/provision/list/route';
import { GET as provisionStatusGet } from '@/app/api/admin/provision/[instanceId]/status/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/provisioning', () => ({
  createVPS: jest.fn(),
  getVPSStatus: jest.fn(),
  pollAndUpdateInstance: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedCreateVPS = createVPS as jest.MockedFunction<typeof createVPS>;
const mockedGetVPSStatus = getVPSStatus as jest.MockedFunction<typeof getVPSStatus>;

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function selectLeftJoinOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const leftJoin = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, orderBy };
}

describe('admin provision API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  describe('POST /api/admin/provision', () => {
    it('creates provisioning request for admin and returns expected shape', async () => {
      const tenantLookup = selectWhereLimit([{ id: 22, name: 'Tenant 22', ownerUserId: 9 }]);
      const ownerLookup = selectWhereLimit([{ email: 'owner@tenant22.dev' }]);
      mockedDb.select
        .mockReturnValueOnce({ from: tenantLookup.from })
        .mockReturnValueOnce({ from: ownerLookup.from });
      mockedCreateVPS.mockResolvedValueOnce({ instanceId: 91, dropletId: 4001 });

      const res = await provisionCreatePost(
        makeRequest('POST', 'http://localhost/api/admin/provision', {
          tenantId: 22,
          plan: 'archon',
        }),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ instanceId: 91, status: 'pending' });
      expect(mockedCreateVPS).toHaveBeenCalledWith({
        tenantId: 22,
        plan: 'archon',
        tenantEmail: 'owner@tenant22.dev',
      });
    });

    it('returns 403 for non-admin session', async () => {
      mockedAuth.mockResolvedValueOnce({ user: { email: 'user@tenant.dev' }, tenantId: 2 } as unknown);

      const res = await provisionCreatePost(
        makeRequest('POST', 'http://localhost/api/admin/provision', {
          tenantId: 22,
          plan: 'strategos',
        }),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
      expect(mockedDb.select).not.toHaveBeenCalled();
      expect(mockedCreateVPS).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/provision/list', () => {
    it('returns instances list with tenantEmail shape for admin', async () => {
      const instanceRows = [
        {
          id: 5,
          tenantId: 22,
          dropletId: 990,
          dropletIp: '10.20.30.40',
          status: 'ready',
          errorMessage: null,
          plan: 'archon',
          isTrial: false,
          ttlExpiresAt: null,
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
          tenantName: 'Tenant 22',
          tenantSlug: 'tenant-22',
        },
      ];

      const instanceLookup = selectLeftJoinOrderBy(instanceRows);
      const tenantLookup = selectWhereLimit([{ ownerUserId: 9 }]);
      const userLookup = selectWhereLimit([{ email: 'owner@tenant22.dev' }]);

      mockedDb.select
        .mockReturnValueOnce({ from: instanceLookup.from })
        .mockReturnValueOnce({ from: tenantLookup.from })
        .mockReturnValueOnce({ from: userLookup.from });

      const res = await provisionListGet(makeRequest('GET', 'http://localhost/api/admin/provision/list'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({
        instances: [
          expect.objectContaining({
            id: 5,
            tenantId: 22,
            status: 'ready',
            plan: 'archon',
            tenantName: 'Tenant 22',
            tenantSlug: 'tenant-22',
            tenantEmail: 'owner@tenant22.dev',
          }),
        ],
      });
    });

    it('returns 403 for non-admin session', async () => {
      mockedAuth.mockResolvedValueOnce({ user: { email: 'user@tenant.dev' }, tenantId: 8 } as unknown);

      const res = await provisionListGet(makeRequest('GET', 'http://localhost/api/admin/provision/list'));

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/provision/[instanceId]/status', () => {
    it('returns instance status shape for valid admin request', async () => {
      const instance = {
        id: 77,
        tenantId: 22,
        dropletId: 1234,
        dropletIp: '1.2.3.4',
        status: 'ready',
      };
      const instanceLookup = selectWhereLimit([instance]);
      mockedDb.select.mockReturnValueOnce({ from: instanceLookup.from });

      const res = await provisionStatusGet(
        makeRequest('GET', 'http://localhost/api/admin/provision/77/status'),
        { params: Promise.resolve({ instanceId: '77' }) },
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual(expect.objectContaining({ id: 77, status: 'ready', dropletIp: '1.2.3.4' }));
      expect(mockedGetVPSStatus).not.toHaveBeenCalled();
    });

    it('returns 403 for non-admin session', async () => {
      mockedAuth.mockResolvedValueOnce({ user: { email: 'user@tenant.dev' }, tenantId: 22 } as unknown);

      const res = await provisionStatusGet(
        makeRequest('GET', 'http://localhost/api/admin/provision/77/status'),
        { params: Promise.resolve({ instanceId: '77' }) },
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('returns 404 for invalid instance ID that does not exist', async () => {
      const instanceLookup = selectWhereLimit([]);
      mockedDb.select.mockReturnValueOnce({ from: instanceLookup.from });

      const res = await provisionStatusGet(
        makeRequest('GET', 'http://localhost/api/admin/provision/999999/status'),
        { params: Promise.resolve({ instanceId: '999999' }) },
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'Instance not found' });
    });
  });
});
