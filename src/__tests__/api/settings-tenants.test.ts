import type { NextRequest } from 'next/server';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as getCurrentTenant } from '@/app/api/tenants/me/route';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { aipipeSyncTenantKeys } from '@/lib/aipipe';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/aipipe', () => ({
  aipipeSyncTenantKeys: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `enc:${value}`),
  tryDecrypt: jest.fn((value: string) => (value.startsWith('enc:') ? value.slice(4) : value)),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;
const mockedAipipeSyncTenantKeys = aipipeSyncTenantKeys as unknown as jest.Mock;

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

function mockSelectWithWhere(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from } as never);
  return { from, where };
}

function mockUpdateWithReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set } as never);
  return { set, where, returning };
}

describe('settings and tenants api routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue(null);
  });

  it('gets tenant settings for authenticated requests', async () => {
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    mockSelectWithLimit([
      {
        settings: {
          openaiKey: 'enc:sk-live',
          primaryAgentName: 'Navi',
        },
        updatedAt,
      },
    ]);

    const req = makeRequest({
      method: 'GET',
      url: 'http://localhost/api/settings',
      headers: { 'x-tenant-id': '42' },
    });

    const res = await getSettings(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      settings: {
        openaiKey: 'sk-live',
        primaryAgentName: 'Navi',
      },
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('updates tenant settings via PUT and syncs provider keys', async () => {
    const updatedAt = new Date('2026-02-02T00:00:00.000Z');
    mockSelectWithLimit([
      {
        id: 5,
        settings: {
          primaryAgentName: 'Navi',
        },
      },
    ]);
    const updateQuery = mockUpdateWithReturning([
      {
        settings: {
          openaiKey: 'enc:sk-next',
          primaryAgentName: 'Kai',
        },
        updatedAt,
      },
    ]);

    const req = makeRequest({
      method: 'PUT',
      url: 'http://localhost/api/settings',
      headers: { 'x-tenant-id': '42' },
      body: {
        merge: false,
        settings: {
          openaiKey: 'sk-next',
          primaryAgentName: 'Kai',
        },
      },
    });

    const res = await putSettings(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: {
          openaiKey: 'enc:sk-next',
          primaryAgentName: 'Kai',
        },
      }),
    );
    expect(mockedAipipeSyncTenantKeys).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ openaiKey: 'sk-next' }),
    );
    expect(data).toEqual({
      settings: {
        openaiKey: 'sk-next',
        primaryAgentName: 'Kai',
      },
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('returns 400 for invalid settings payload', async () => {
    const req = makeRequest({
      method: 'PUT',
      url: 'http://localhost/api/settings',
      headers: { 'x-tenant-id': '42' },
      body: {
        settings: 'not-an-object',
      },
    });

    const res = await putSettings(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid settings payload' });
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('gets current tenant with member count', async () => {
    mockSelectWithLimit([{ id: 42, slug: 'openclaw', name: 'OpenClaw' }]);
    mockSelectWithWhere([
      { id: 1, tenantId: 42, userEmail: 'a@example.com', role: 'owner' },
      { id: 2, tenantId: 42, userEmail: 'b@example.com', role: 'admin' },
      { id: 3, tenantId: 42, userEmail: 'c@example.com', role: 'member' },
    ]);

    const req = makeRequest({
      method: 'GET',
      url: 'http://localhost/api/tenants/me',
      headers: { 'x-tenant-id': '42' },
    });

    const res = await getCurrentTenant(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ id: 42, slug: 'openclaw', name: 'OpenClaw', memberCount: 3 });
  });

  it.each([
    {
      name: 'settings GET',
      invoke: () =>
        getSettings(
          makeRequest({ method: 'GET', url: 'http://localhost/api/settings' }),
        ),
    },
    {
      name: 'settings PUT',
      invoke: () =>
        putSettings(
          makeRequest({
            method: 'PUT',
            url: 'http://localhost/api/settings',
            body: { settings: { primaryAgentName: 'Kai' } },
          }),
        ),
    },
    {
      name: 'tenants/me GET',
      invoke: () =>
        getCurrentTenant(
          makeRequest({ method: 'GET', url: 'http://localhost/api/tenants/me' }),
        ),
    },
  ])('returns 401 when auth headers are missing: $name', async ({ invoke }) => {
    const res = await invoke();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });
});
