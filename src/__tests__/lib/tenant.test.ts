import type { NextRequest } from 'next/server';
import { getTenantId, resolveTenantId } from '@/lib/tenant';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

const mockedDb = jest.mocked(db) as unknown as { select: jest.Mock };
// auth has NextAuth v5 overloads — cast to plain Mock to allow mockResolvedValue without 'never' errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<any>>;

describe('tenant helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_SECRET = 'unit-test-secret';
  });

  afterEach(() => {
    delete process.env.API_SECRET;
  });

  function createRequest(headers: Record<string, string> = {}): NextRequest {
    return {
      headers: {
        get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
      },
    } as unknown as NextRequest;
  }

  function mockSelectReturning(rows: Array<{ tenantId: number }> = []) {
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValueOnce({ from } as any);
    return { limit, where, from };
  }

  it('extracts tenant id from x-tenant-id header', () => {
    const req = createRequest({ 'x-tenant-id': '42' });
    expect(getTenantId(req)).toBe(42);
  });

  it('falls back to bearer token matching API secret', () => {
    const req = createRequest({ authorization: 'Bearer unit-test-secret' });
    expect(getTenantId(req)).toBe(1);
  });

  it('ignores malformed tenant headers and returns null', () => {
    const req = createRequest({ 'x-tenant-id': '-4' });
    expect(getTenantId(req)).toBeNull();
  });

  it('returns null when headers are missing', () => {
    const req = createRequest();
    expect(getTenantId(req)).toBeNull();
  });

  it('resolveTenantId uses email header lookup when tenant id missing', async () => {
    const req = createRequest({ 'x-user-email': 'alice@example.com' });
    mockSelectReturning([{ tenantId: 7 }]);

    await expect(resolveTenantId(req)).resolves.toBe(7);
  });

  it('resolveTenantId returns tenant id from auth session', async () => {
    const req = createRequest();
    mockedAuth.mockResolvedValue({ tenantId: 9 });

    await expect(resolveTenantId(req)).resolves.toBe(9);
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('resolveTenantId falls back to auth session email lookup', async () => {
    const req = createRequest();
    mockSelectReturning([{ tenantId: 33 }]);
    mockedAuth.mockResolvedValue({ user: { email: 'bob@example.com' } });

    await expect(resolveTenantId(req)).resolves.toBe(33);
    expect(mockedAuth).toHaveBeenCalled();
  });

  it('resolveTenantId returns null when all lookups fail', async () => {
    mockedAuth.mockResolvedValue(null);
    const req = createRequest();

    await expect(resolveTenantId(req)).resolves.toBeNull();
  });
});
