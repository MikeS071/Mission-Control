import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { GET as usersGET, PATCH as usersPATCH } from '@/app/api/admin/users/route';
import { GET as billingStatsGET } from '@/app/api/admin/billing/stats/route';
import {
  GET as modelConfigGET,
  POST as modelConfigPOST,
  PATCH as modelConfigPATCH,
  DELETE as modelConfigDELETE,
} from '@/app/api/admin/model-config/route';
import { GET as tenantsGET } from '@/app/api/admin/tenants/route';
import { GET as adminStatsGET } from '@/app/api/admin/stats/route';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
  insert: jest.Mock;
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;

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

function mockSelectResolvedRows(rows: unknown[]) {
  const from = jest.fn().mockResolvedValue(rows);
  mockedDb.select.mockReturnValueOnce({ from });
  return { from };
}

function mockSelectWhereLimitRows(rows: unknown[]) {
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

describe('admin api routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@example.com', isAdmin: true },
      tenantId: 1,
    });
  });

  it('lists admin route files and includes user/billing/model/tenant/stats categories', () => {
    const adminDir = path.join(process.cwd(), 'src/app/api/admin');
    const routeFiles: string[] = [];
    const stack = [adminDir];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile() && entry.name === 'route.ts') {
          routeFiles.push(path.relative(adminDir, fullPath).replace(/\\/g, '/'));
        }
      }
    }

    expect(routeFiles).toEqual(expect.arrayContaining([
      'users/route.ts',
      'billing/stats/route.ts',
      'model-config/route.ts',
      'tenants/route.ts',
      'stats/route.ts',
    ]));
  });

  it('rejects non-admin users with 403', async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { email: 'member@example.com', isAdmin: false },
      tenantId: 2,
    });

    const res = await usersGET(makeRequest('GET', 'http://localhost/api/admin/users'));
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(payload).toEqual({ error: 'Admin access required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('lists users for admin', async () => {
    mockSelectResolvedRows([
      { id: 1, email: 'a@example.com', name: 'Alice' },
      { id: 2, email: 'b@example.com', name: 'Bob' },
    ]);

    const res = await usersGET(makeRequest('GET', 'http://localhost/api/admin/users'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      users: [
        { id: 1, email: 'a@example.com', name: 'Alice' },
        { id: 2, email: 'b@example.com', name: 'Bob' },
      ],
    });
  });

  it('updates a user for admin', async () => {
    const update = mockUpdateReturning([
      { id: 7, email: 'chris@example.com', name: 'Chris P.' },
    ]);

    const res = await usersPATCH(
      makeRequest('PATCH', 'http://localhost/api/admin/users', { id: 7, name: 'Chris P.' }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      user: { id: 7, email: 'chris@example.com', name: 'Chris P.' },
    });
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chris P.' }));
  });

  it('returns billing admin stats', async () => {
    mockSelectResolvedRows([
      { plan: 'pro', status: 'active', seats: 3 },
      { plan: 'team', status: 'active', seats: 12 },
      { plan: 'pro', status: 'past_due', seats: 2 },
    ]);

    const res = await billingStatsGET(makeRequest('GET', 'http://localhost/api/admin/billing/stats'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      totalTenantsWithSubscriptions: 3,
      activeSubscriptions: 2,
      totalSeats: 17,
      byPlan: { pro: 2, team: 1 },
    });
  });

  it('creates model configuration for a tenant', async () => {
    mockSelectWhereLimitRows([]);
    const insert = mockInsertReturning([
      { tenantId: 11, settings: { models: { primary: 'gpt-4o-mini' } } },
    ]);

    const res = await modelConfigPOST(
      makeRequest('POST', 'http://localhost/api/admin/model-config', {
        tenantId: 11,
        modelConfig: { primary: 'gpt-4o-mini' },
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      tenantId: 11,
      modelConfig: { primary: 'gpt-4o-mini' },
    });
    expect(insert.values).toHaveBeenCalled();
  });

  it('lists model configurations', async () => {
    mockSelectResolvedRows([
      { tenantId: 11, settings: { models: { primary: 'gpt-4o-mini' } } },
      { tenantId: 12, settings: { models: { primary: 'gpt-4.1' } } },
    ]);

    const res = await modelConfigGET(makeRequest('GET', 'http://localhost/api/admin/model-config'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      configs: [
        { tenantId: 11, modelConfig: { primary: 'gpt-4o-mini' } },
        { tenantId: 12, modelConfig: { primary: 'gpt-4.1' } },
      ],
    });
  });

  it('updates model configuration for an existing tenant', async () => {
    mockSelectWhereLimitRows([{ tenantId: 12, settings: { models: { primary: 'gpt-4.1' } } }]);
    const update = mockUpdateReturning([
      { tenantId: 12, settings: { models: { primary: 'gpt-4.1-mini' } } },
    ]);

    const res = await modelConfigPATCH(
      makeRequest('PATCH', 'http://localhost/api/admin/model-config', {
        tenantId: 12,
        modelConfig: { primary: 'gpt-4.1-mini' },
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      tenantId: 12,
      modelConfig: { primary: 'gpt-4.1-mini' },
    });
    expect(update.set).toHaveBeenCalled();
  });

  it('deletes model configuration for a tenant', async () => {
    mockSelectWhereLimitRows([{ tenantId: 12, settings: { models: { primary: 'gpt-4.1' }, other: true } }]);
    mockUpdateReturning([{ tenantId: 12, settings: { other: true } }]);

    const res = await modelConfigDELETE(
      makeRequest('DELETE', 'http://localhost/api/admin/model-config', {
        tenantId: 12,
      }),
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      tenantId: 12,
    });
  });

  it('lists tenants for tenant management', async () => {
    mockSelectResolvedRows([
      { id: 1, name: 'Core', slug: 'core', plan: 'team' },
      { id: 2, name: 'Labs', slug: 'labs', plan: 'pro' },
    ]);

    const res = await tenantsGET(makeRequest('GET', 'http://localhost/api/admin/tenants'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      tenants: [
        { id: 1, name: 'Core', slug: 'core', plan: 'team' },
        { id: 2, name: 'Labs', slug: 'labs', plan: 'pro' },
      ],
    });
  });

  it('returns top-level admin stats', async () => {
    mockSelectResolvedRows([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockSelectResolvedRows([{ id: 1 }, { id: 2 }]);
    mockSelectResolvedRows([{ status: 'active' }, { status: 'past_due' }]);

    const res = await adminStatsGET(makeRequest('GET', 'http://localhost/api/admin/stats'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      users: 3,
      tenants: 2,
      activeSubscriptions: 1,
    });
  });
});
