import type { NextRequest } from 'next/server';
import { POST as createTrialPost } from '@/app/api/admin/provision/trial/route';
import { POST as revokeTrialPost } from '@/app/api/admin/provision/trial/[instanceId]/revoke/route';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { createVPS, deleteVPS } from '@/lib/provisioning';

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
  deleteVPS: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;
const mockedCreateVPS = createVPS as unknown as jest.Mock;
const mockedDeleteVPS = deleteVPS as unknown as jest.Mock;

function makeRequest(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}): NextRequest {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new Request(options.url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }) as unknown as NextRequest;
}

function mockSelectWithLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from } as never);
  return { from, where, limit };
}

function mockUpdateWithWhere() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set } as never);
  return { set, where };
}

describe('admin trial provision routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@example.com' }, tenantId: 1 });
  });

  it('creates a trial instance for valid admin request', async () => {
    mockSelectWithLimit([{ id: 21, email: 'tenant@example.com' }]);
    mockSelectWithLimit([{ id: 77, ownerUserId: 21 }]);
    mockedCreateVPS.mockResolvedValue({ instanceId: 303 });

    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/admin/provision/trial',
      body: {
        tenantEmail: 'tenant@example.com',
        plan: 'strategos',
        ttlHours: 24,
      },
    });

    const res = await createTrialPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      instanceId: 303,
      status: 'pending',
      message: 'Trial instance provisioning started',
    });
    expect(mockedCreateVPS).toHaveBeenCalledWith({
      tenantId: 77,
      plan: 'strategos',
      tenantEmail: 'tenant@example.com',
      isTrial: true,
      ttlHours: 24,
    });
  });

  it('revokes a trial instance for valid admin request', async () => {
    mockSelectWithLimit([{ id: 9, isTrial: true, dropletId: 555 }]);
    const updateQuery = mockUpdateWithWhere();
    mockedDeleteVPS.mockResolvedValue(undefined);

    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/admin/provision/trial/9/revoke',
    });

    const res = await revokeTrialPost(req, {
      params: Promise.resolve({ instanceId: '9' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      success: true,
      message: 'Trial instance revoked successfully',
    });
    expect(mockedDeleteVPS).toHaveBeenCalledWith(555);
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Trial instance revoked by admin',
      }),
    );
    expect(updateQuery.where).toHaveBeenCalled();
  });

  it('rejects non-admin users', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'user@example.com' }, tenantId: 2 });

    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/admin/provision/trial',
      body: {
        tenantEmail: 'tenant@example.com',
        plan: 'archon',
        ttlHours: 48,
      },
    });

    const res = await createTrialPost(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toEqual({ error: 'Admin access required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedCreateVPS).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid or missing creation params', async () => {
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/admin/provision/trial',
      body: {
        tenantEmail: 'tenant@example.com',
      },
    });

    const res = await createTrialPost(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toMatchObject({ error: 'Invalid request' });
    expect(Array.isArray(data.details)).toBe(true);
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid revoke instanceId', async () => {
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/admin/provision/trial/not-a-number/revoke',
    });

    const res = await revokeTrialPost(req, {
      params: Promise.resolve({ instanceId: 'not-a-number' }),
    });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid instance ID' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});
