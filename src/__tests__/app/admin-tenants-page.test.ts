import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import AdminTenantsPage from '@/app/admin/tenants/page';

type MockDb = {
  select: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

function createSelectFromOrderByBuilder(result: unknown[] | Error) {
  const orderBy = result instanceof Error
    ? jest.fn().mockRejectedValue(result)
    : jest.fn().mockResolvedValue(result);
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy };
}

describe('admin tenants list page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tenants table with row links and user counts', async () => {
    const builder = createSelectFromOrderByBuilder([
      {
        id: 11,
        name: 'Alpha Corp',
        slug: 'alpha',
        plan: 'pro',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        userCount: 4,
      },
      {
        id: 12,
        name: 'Beta Team',
        slug: 'beta',
        plan: 'free',
        createdAt: null,
        userCount: 0,
      },
    ]);

    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminTenantsPage();
    const html = renderToStaticMarkup(node);

    expect(builder.orderBy).toHaveBeenCalled();
    expect(html.startsWith('<section')).toBe(true);
    expect(html).not.toContain('<main');
    expect(html).toContain('<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">ID</th>');
    expect(html).toContain('Alpha Corp');
    expect(html).toContain('href="/admin/tenants/11"');
    expect(html).toContain('href="/admin/tenants/12"');
    expect(html).toContain('Jan 2, 2026');
    expect(html).toContain('4');
    expect(html).toContain('Not set');
  });

  it('renders a fallback error panel when tenant query fails', async () => {
    const builder = createSelectFromOrderByBuilder(new Error('db unavailable'));
    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminTenantsPage();
    const html = renderToStaticMarkup(node);

    expect(html.startsWith('<section')).toBe(true);
    expect(html).not.toContain('<main');
    expect(html).toContain('Failed to load tenants.');
  });

  it('renders an empty-state row when no tenants exist', async () => {
    const builder = createSelectFromOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminTenantsPage();
    const html = renderToStaticMarkup(node);

    expect(html.startsWith('<section')).toBe(true);
    expect(html).not.toContain('<main');
    expect(html).toContain('No tenants found.');
  });
});
