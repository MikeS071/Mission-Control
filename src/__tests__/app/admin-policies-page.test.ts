import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import AdminPoliciesPage from '@/app/admin/policies/page';

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

describe('admin policies list page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tenant policies and links to policy detail pages', async () => {
    const builder = createSelectFromOrderByBuilder([
      {
        id: 4,
        name: 'Acme',
        slug: 'acme',
        plan: 'strategos',
      },
      {
        id: 7,
        name: 'Beta',
        slug: 'beta',
        plan: 'archon',
      },
    ]);
    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminPoliciesPage();
    const html = renderToStaticMarkup(node);

    expect(builder.orderBy).toHaveBeenCalled();
    expect(html).toContain('Tenant Policies');
    expect(html).toContain('Acme');
    expect(html).toContain('Beta');
    expect(html).toContain('href="/admin/policies/4"');
    expect(html).toContain('href="/admin/policies/7"');
    expect(html).toContain('strategos');
    expect(html).toContain('archon');
  });

  it('renders fallback error panel when policy list loading fails', async () => {
    const builder = createSelectFromOrderByBuilder(new Error('db down'));
    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminPoliciesPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Failed to load tenant policies.');
  });

  it('renders empty state when there are no tenants', async () => {
    const builder = createSelectFromOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: builder.from });

    const node = await AdminPoliciesPage();
    const html = renderToStaticMarkup(node);

    expect(html).toContain('No tenants found.');
  });
});
