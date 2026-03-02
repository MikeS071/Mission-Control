import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getAdminTenantDetailData } from '@/app/admin/tenants/[id]/page';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function selectLeftJoinWhereOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const leftJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where, orderBy };
}

describe('admin tenant detail page data loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('returns tenant detail, users, and usage stats for an admin', async () => {
    const tenantLookup = selectWhereLimit([
      {
        id: 22,
        name: 'Acme Labs',
        slug: 'acme-labs',
        plan: 'pro',
        createdAt: new Date('2026-02-20T10:30:00.000Z'),
      },
    ]);
    const usersLookup = selectLeftJoinWhereOrderBy([
      {
        id: 7,
        email: 'owner@acme.dev',
        name: 'Owner',
        role: 'owner',
        joinedAt: new Date('2026-02-21T09:00:00.000Z'),
      },
      {
        id: null,
        email: 'invite-only@acme.dev',
        name: null,
        role: 'member',
        joinedAt: null,
      },
    ]);

    mockedDb.select
      .mockReturnValueOnce({ from: tenantLookup.from })
      .mockReturnValueOnce({ from: usersLookup.from });
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        {
          task_count: 9,
          event_count: 41,
          total_tokens: '5555',
          total_cost_usd: '12.3400',
        },
      ],
    });

    const result = await getAdminTenantDetailData('22');

    expect(result).toEqual({
      tenant: {
        id: 22,
        name: 'Acme Labs',
        slug: 'acme-labs',
        plan: 'pro',
        createdAt: new Date('2026-02-20T10:30:00.000Z'),
      },
      users: [
        {
          id: 7,
          email: 'owner@acme.dev',
          name: 'Owner',
          role: 'owner',
          joinedAt: new Date('2026-02-21T09:00:00.000Z'),
        },
        {
          id: null,
          email: 'invite-only@acme.dev',
          name: null,
          role: 'member',
          joinedAt: null,
        },
      ],
      usage: {
        taskCount: 9,
        eventCount: 41,
        totalTokens: 5555,
        totalCostUsd: '12.3400',
      },
    });
    expect(tenantLookup.where).toHaveBeenCalled();
    expect(tenantLookup.limit).toHaveBeenCalledWith(1);
    expect(usersLookup.leftJoin).toHaveBeenCalled();
    expect(usersLookup.where).toHaveBeenCalled();
    expect(usersLookup.orderBy).toHaveBeenCalled();
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });

  it('throws unauthorized when no session exists', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    await expect(getAdminTenantDetailData('22')).rejects.toThrow('UNAUTHORIZED');
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('throws for invalid tenant id params', async () => {
    await expect(getAdminTenantDetailData('not-a-number')).rejects.toThrow('INVALID_TENANT_ID');
    await expect(getAdminTenantDetailData('-5')).rejects.toThrow('INVALID_TENANT_ID');
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('returns null usage when no usage stats are available', async () => {
    const tenantLookup = selectWhereLimit([
      {
        id: 33,
        name: 'No Usage Co',
        slug: 'no-usage',
        plan: 'free',
        createdAt: new Date('2026-02-22T00:00:00.000Z'),
      },
    ]);
    const usersLookup = selectLeftJoinWhereOrderBy([]);

    mockedDb.select
      .mockReturnValueOnce({ from: tenantLookup.from })
      .mockReturnValueOnce({ from: usersLookup.from });
    mockedDb.execute.mockResolvedValueOnce({ rows: [] });

    const result = await getAdminTenantDetailData('33');

    expect(result.users).toEqual([]);
    expect(result.usage).toBeNull();
  });
});
