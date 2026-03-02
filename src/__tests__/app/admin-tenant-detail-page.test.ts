import { renderToStaticMarkup } from 'react-dom/server';

import { db } from '@/lib/db';
import AdminTenantDetailPage from '@/app/admin/tenants/[id]/page';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

type MockDb = {
  select: jest.Mock;
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

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

describe('admin tenant detail page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tenant details, users, and usage stats', async () => {
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
          task_count: 12,
          event_count: 41,
          total_tokens: '5555',
          total_cost_usd: '12.3400',
        },
      ],
    });

    const node = await AdminTenantDetailPage({ params: Promise.resolve({ id: '22' }) });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Acme Labs');
    expect(html).toContain('Tenant ID: 22');
    expect(html).toContain('acme-labs');
    expect(html).toContain('pro');
    expect(html).toContain('owner@acme.dev');
    expect(html).toContain('invite-only@acme.dev');
    expect(html).toContain('12');
    expect(html).toContain('41');
    expect(html).toContain('5,555');
    expect(html).toContain('$12.3400');
    expect(html).toContain('href="/admin/tenants"');

    expect(tenantLookup.where).toHaveBeenCalled();
    expect(tenantLookup.limit).toHaveBeenCalledWith(1);
    expect(usersLookup.leftJoin).toHaveBeenCalled();
    expect(usersLookup.where).toHaveBeenCalled();
    expect(usersLookup.orderBy).toHaveBeenCalled();
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });

  it('renders an invalid id panel for bad route params', async () => {
    const node = await AdminTenantDetailPage({ params: Promise.resolve({ id: 'abc' }) });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Invalid tenant ID.');
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('renders empty users and usage sections when data is unavailable', async () => {
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
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        {
          task_count: 0,
          event_count: 0,
          total_tokens: 0,
          total_cost_usd: '0.0000',
        },
      ],
    });

    const node = await AdminTenantDetailPage({ params: Promise.resolve({ id: '33' }) });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('No users found for this tenant.');
    expect(html).toContain('No usage stats available for this tenant yet.');
  });

  it('renders an error panel when tenant detail query fails', async () => {
    mockedDb.select.mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    const node = await AdminTenantDetailPage({ params: Promise.resolve({ id: '55' }) });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Failed to load tenant details.');
  });

  it('renders a not-found panel when the tenant does not exist', async () => {
    const tenantLookup = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: tenantLookup.from });

    const node = await AdminTenantDetailPage({ params: Promise.resolve({ id: '404' }) });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Tenant not found.');
  });
});
