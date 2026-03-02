import { db } from '@/lib/db';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminUsersPage from '@/app/admin/users/page';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

type MockDb = {
  select: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

type UserRow = {
  id: number;
  email: string;
  tenantName: string | null;
  createdAt: Date;
  lastLogin: Date;
};

function createSelectJoinOrderByBuilder(rows: UserRow[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const secondJoin = {
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    orderBy,
  };
  secondJoin.leftJoin.mockReturnValue(secondJoin);
  secondJoin.innerJoin.mockReturnValue(secondJoin);

  const firstJoin = {
    leftJoin: jest.fn().mockReturnValue(secondJoin),
    innerJoin: jest.fn().mockReturnValue(secondJoin),
    orderBy,
  };
  const from = jest.fn().mockReturnValue(firstJoin);

  return { from, firstJoin, secondJoin, orderBy };
}

describe('admin users page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all expected columns and user rows', async () => {
    const rows: UserRow[] = [
      {
        id: 12,
        email: 'owner@example.com',
        tenantName: 'Alpha',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        lastLogin: new Date('2026-02-01T00:00:00.000Z'),
      },
    ];
    const selectBuilder = createSelectJoinOrderByBuilder(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const node = await AdminUsersPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('ID');
    expect(html).toContain('Email');
    expect(html).toContain('Tenant');
    expect(html).toContain('Created');
    expect(html).toContain('Last Login');
    expect(html).toContain('owner@example.com');
    expect(html).toContain('Alpha');
    expect(html).toContain('2026-01-05');
    expect(html).toContain('2026-02-01');
    expect(selectBuilder.orderBy).toHaveBeenCalled();
    expect(selectBuilder.firstJoin.leftJoin.mock.calls.length + selectBuilder.firstJoin.innerJoin.mock.calls.length).toBeGreaterThan(0);
    expect(selectBuilder.secondJoin.leftJoin.mock.calls.length + selectBuilder.secondJoin.innerJoin.mock.calls.length).toBeGreaterThan(0);
  });

  it('renders empty state when no users are returned', async () => {
    const selectBuilder = createSelectJoinOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const node = await AdminUsersPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('No users found');
  });

  it('throws when loading users fails', async () => {
    mockedDb.select.mockImplementationOnce(() => {
      throw new Error('db unavailable');
    });

    await expect(AdminUsersPage()).rejects.toThrow('db unavailable');
  });
});
