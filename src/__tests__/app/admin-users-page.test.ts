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
  createdAt: Date | null;
  lastLogin: Date | null;
};

function createSelectJoinOrderByBuilder(rowsOrError: UserRow[] | Error) {
  const orderBy = rowsOrError instanceof Error
    ? jest.fn().mockRejectedValue(rowsOrError)
    : jest.fn().mockResolvedValue(rowsOrError);
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

  it('renders fallback values when tenant and timestamps are missing', async () => {
    const rows: UserRow[] = [
      {
        id: 21,
        email: 'orphan@example.com',
        tenantName: null,
        createdAt: null,
        lastLogin: null,
      },
    ];
    const selectBuilder = createSelectJoinOrderByBuilder(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const node = await AdminUsersPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('orphan@example.com');
    expect(html).toContain('<td class="whitespace-nowrap px-4 py-3">—</td>');
  });

  it('renders empty state when no users are returned', async () => {
    const selectBuilder = createSelectJoinOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const node = await AdminUsersPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('No users found');
  });

  it('renders a fallback error panel when loading users fails', async () => {
    const selectBuilder = createSelectJoinOrderByBuilder(new Error('db unavailable'));
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const node = await AdminUsersPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Failed to load users.');
  });
});
