import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { GET as adminPoliciesGet } from '@/app/api/admin/policies/route';
import { GET as adminPolicyGet, PUT as adminPolicyPut } from '@/app/api/admin/policies/[tenantId]/route';
import { POST as adminPolicyResetPost } from '@/app/api/admin/policies/[tenantId]/reset/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

function makeRequest(options: {
  method: 'GET' | 'PUT' | 'POST';
  url: string;
  body?: unknown;
}): NextRequest {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  return new Request(options.url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }) as unknown as NextRequest;
}

function selectLeftJoinOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const leftJoin = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, orderBy };
}

function selectLeftJoinWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const leftJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where, limit };
}

function insertValuesOnConflictReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  return { values, onConflictDoUpdate, returning };
}

function insertValuesResolved(value: unknown = undefined) {
  const values = jest.fn().mockResolvedValue(value);
  return { values };
}

describe('admin policies API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@openclaw.dev', id: '11' },
      tenantId: 1,
    } as unknown);
  });

  describe('GET /api/admin/policies', () => {
    it('returns policy list with defaults when tenant policy row is missing', async () => {
      const rows = [
        {
          tenantId: 2,
          tenantName: 'Alpha',
          tenantPlan: 'free',
          tier: null,
          rules: null,
          customOverrides: null,
          createdAt: null,
          updatedAt: null,
        },
        {
          tenantId: 3,
          tenantName: 'Beta',
          tenantPlan: 'team',
          tier: 'pro',
          rules: [
            { featureKey: 'agents', limitType: 'number', limitValue: 5, enabled: true },
          ],
          customOverrides: [
            { featureKey: 'agents', limitType: 'number', limitValue: 5, enabled: true },
          ],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ];
      const selectBuilder = selectLeftJoinOrderBy(rows);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await adminPoliciesGet(
        makeRequest({ method: 'GET', url: 'http://localhost/api/admin/policies' }),
      );
      const payload = await res.json();

      expect(res.status).toBe(200);
      expect(payload).toHaveLength(2);
      expect(payload[0]).toEqual(
        expect.objectContaining({
          tenantId: 2,
          tenantName: 'Alpha',
          tier: 'free',
          customOverrides: [],
        }),
      );
      expect(Array.isArray(payload[0].rules)).toBe(true);
      expect(payload[1]).toEqual(
        expect.objectContaining({
          tenantId: 3,
          tenantName: 'Beta',
          tier: 'pro',
          customOverrides: [
            { featureKey: 'agents', limitType: 'number', limitValue: 5, enabled: true },
          ],
        }),
      );
      expect(selectBuilder.leftJoin).toHaveBeenCalled();
      expect(selectBuilder.orderBy).toHaveBeenCalled();
    });

    it('returns 403 for non-admin sessions', async () => {
      mockedAuth.mockResolvedValueOnce({ user: { email: 'member@tenant.dev' }, tenantId: 3 } as unknown);

      const res = await adminPoliciesGet(
        makeRequest({ method: 'GET', url: 'http://localhost/api/admin/policies' }),
      );

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/policies/[tenantId]', () => {
    it('returns policy for tenant id', async () => {
      const rows = [
        {
          tenantId: 9,
          tenantName: 'Gamma',
          tenantPlan: 'team',
          tier: 'team',
          rules: [{ featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true }],
          customOverrides: [],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ];
      const selectBuilder = selectLeftJoinWhereLimit(rows);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await adminPolicyGet(
        makeRequest({ method: 'GET', url: 'http://localhost/api/admin/policies/9' }),
        { params: Promise.resolve({ tenantId: '9' }) },
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({
          tenantId: 9,
          tenantName: 'Gamma',
          tier: 'team',
        }),
      );
      expect(selectBuilder.where).toHaveBeenCalled();
      expect(selectBuilder.limit).toHaveBeenCalledWith(1);
    });

    it('returns 400 for invalid tenant id', async () => {
      const res = await adminPolicyGet(
        makeRequest({ method: 'GET', url: 'http://localhost/api/admin/policies/not-a-number' }),
        { params: Promise.resolve({ tenantId: 'not-a-number' }) },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid tenant ID' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/admin/policies/[tenantId]', () => {
    it('returns 400 for invalid payload', async () => {
      const res = await adminPolicyPut(
        makeRequest({
          method: 'PUT',
          url: 'http://localhost/api/admin/policies/4',
          body: { tier: 'startup', reason: '' },
        }),
        { params: Promise.resolve({ tenantId: '4' }) },
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toMatchObject({ error: 'Invalid payload' });
      expect(Array.isArray(body.issues)).toBe(true);
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('updates policy, writes audit log, and returns updated policy', async () => {
      const policyLookup = selectLeftJoinWhereLimit([
        {
          tenantId: 4,
          tenantName: 'Delta',
          tenantPlan: 'free',
          tier: 'free',
          rules: [{ featureKey: 'agents', limitType: 'number', limitValue: 1, enabled: true }],
          customOverrides: [],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ]);
      const upsertResult = insertValuesOnConflictReturning([
        {
          tenantId: 4,
          tier: 'pro',
          rules: [{ featureKey: 'agents', limitType: 'number', limitValue: 9, enabled: true }],
          customOverrides: [{ featureKey: 'agents', limitType: 'number', limitValue: 9, enabled: true }],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ]);
      const auditInsert = insertValuesResolved();

      mockedDb.select.mockReturnValueOnce({ from: policyLookup.from });
      mockedDb.insert
        .mockReturnValueOnce(upsertResult as never)
        .mockReturnValueOnce(auditInsert as never);

      const res = await adminPolicyPut(
        makeRequest({
          method: 'PUT',
          url: 'http://localhost/api/admin/policies/4',
          body: {
            tier: 'pro',
            customOverrides: [
              { featureKey: 'agents', limitType: 'number', limitValue: 9, enabled: true },
            ],
            reason: 'Upgrade for launch',
          },
        }),
        { params: Promise.resolve({ tenantId: '4' }) },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual(
        expect.objectContaining({
          tenantId: 4,
          tenantName: 'Delta',
          tier: 'pro',
          customOverrides: [
            { featureKey: 'agents', limitType: 'number', limitValue: 9, enabled: true },
          ],
        }),
      );
      expect(upsertResult.onConflictDoUpdate).toHaveBeenCalled();
      expect(auditInsert.values).toHaveBeenCalledTimes(1);
      const [auditPayload] = auditInsert.values.mock.calls[0] as [Record<string, unknown>];
      expect(auditPayload).toEqual(
        expect.objectContaining({
          tenantId: 4,
          changeReason: 'Upgrade for launch',
          oldRules: [{ featureKey: 'agents', limitType: 'number', limitValue: 1, enabled: true }],
        }),
      );
      expect(auditPayload.newRules).toEqual(
        expect.arrayContaining([
          { featureKey: 'agents', limitType: 'number', limitValue: 9, enabled: true },
        ]),
      );
    });
  });

  describe('POST /api/admin/policies/[tenantId]/reset', () => {
    it('resets policy to tier defaults and clears overrides', async () => {
      const policyLookup = selectLeftJoinWhereLimit([
        {
          tenantId: 6,
          tenantName: 'Epsilon',
          tenantPlan: 'team',
          tier: 'team',
          rules: [{ featureKey: 'models', limitType: 'number', limitValue: 2, enabled: true }],
          customOverrides: [{ featureKey: 'models', limitType: 'number', limitValue: 2, enabled: true }],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ]);
      const upsertResult = insertValuesOnConflictReturning([
        {
          tenantId: 6,
          tier: 'team',
          rules: [{ featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true }],
          customOverrides: [],
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ]);
      const auditInsert = insertValuesResolved();

      mockedDb.select.mockReturnValueOnce({ from: policyLookup.from });
      mockedDb.insert
        .mockReturnValueOnce(upsertResult as never)
        .mockReturnValueOnce(auditInsert as never);

      const res = await adminPolicyResetPost(
        makeRequest({ method: 'POST', url: 'http://localhost/api/admin/policies/6/reset' }),
        { params: Promise.resolve({ tenantId: '6' }) },
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual(
        expect.objectContaining({
          tenantId: 6,
          tier: 'team',
          customOverrides: [],
        }),
      );
      expect(auditInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 6,
          changeReason: 'Reset to tier defaults',
        }),
      );
    });
  });
});
