import { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { listContent, type ContentItem } from '@/lib/content';
import { GET as adminContentGet } from '@/app/api/admin/content/route';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/content', () => ({
  listContent: jest.fn(),
}));

const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedListContent = listContent as jest.MockedFunction<typeof listContent>;

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

describe('admin content list API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns filtered content list and total', async () => {
    const rows: ContentItem[] = [
      {
        id: 101,
        title: 'Roadmap Update',
        slug: 'roadmap-update',
        status: 'draft',
        summary: 'Pipeline summary',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ];
    mockedListContent.mockResolvedValueOnce(rows);

    const response = await adminContentGet(makeRequest('http://localhost/api/admin/content?status=draft&q=road'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ items: rows, total: 1 });
    expect(mockedListContent).toHaveBeenCalledWith(1, {
      status: 'draft',
      query: 'road',
    });
  });

  it('GET returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const response = await adminContentGet(makeRequest('http://localhost/api/admin/content'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedListContent).not.toHaveBeenCalled();
  });

  it('GET returns 403 when caller is not admin tenant', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@tenant.dev' }, tenantId: 4 } as unknown);

    const response = await adminContentGet(makeRequest('http://localhost/api/admin/content'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedListContent).not.toHaveBeenCalled();
  });

  it('GET returns 400 for unsupported status filter', async () => {
    const response = await adminContentGet(makeRequest('http://localhost/api/admin/content?status=archived'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid status filter' });
    expect(mockedListContent).not.toHaveBeenCalled();
  });

  it('GET treats status=all as no status filter', async () => {
    mockedListContent.mockResolvedValueOnce([]);

    const response = await adminContentGet(makeRequest('http://localhost/api/admin/content?status=all'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ items: [], total: 0 });
    expect(mockedListContent).toHaveBeenCalledWith(1, {
      query: undefined,
      status: undefined,
    });
  });
});
