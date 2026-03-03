import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  DELETE as deleteContentBySlug,
  GET as getContentBySlug,
  PATCH as patchContentBySlug,
} from '@/app/api/admin/content/[slug]/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

function makeRequest(method: 'GET' | 'PATCH' | 'DELETE', url: string, body?: unknown): NextRequest {
  const requestHeaders = new Headers();
  if (body !== undefined) {
    requestHeaders.set('content-type', 'application/json');
  }

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeContext(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function updateSetWhereReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning };
}

describe('admin content detail API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns a single content item for admin', async () => {
    const row = {
      id: 10,
      tenantId: 1,
      slug: 'weekly-update',
      title: 'Weekly Update',
      summary: 'Short summary',
      contentMd: '# Hello',
      status: 'draft',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-02T00:00:00.000Z'),
    };
    const selectBuilder = selectWhereLimit([row]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await getContentBySlug(
      makeRequest('GET', 'http://localhost/api/admin/content/weekly-update'),
      makeContext('weekly-update'),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      ...row,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
    });
    expect(selectBuilder.where).toHaveBeenCalled();
    expect(selectBuilder.limit).toHaveBeenCalledWith(1);
  });

  it('GET returns 401 without session', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await getContentBySlug(
      makeRequest('GET', 'http://localhost/api/admin/content/weekly-update'),
      makeContext('weekly-update'),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('GET returns 403 for non-admin tenant', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@openclaw.dev' }, tenantId: 3 } as unknown);

    const res = await getContentBySlug(
      makeRequest('GET', 'http://localhost/api/admin/content/weekly-update'),
      makeContext('weekly-update'),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('GET returns 404 when content item is missing', async () => {
    const selectBuilder = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await getContentBySlug(
      makeRequest('GET', 'http://localhost/api/admin/content/missing'),
      makeContext('missing'),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Content item not found' });
  });

  it('PATCH updates editable fields for a content item', async () => {
    const updated = {
      id: 10,
      tenantId: 1,
      slug: 'weekly-update',
      title: 'Weekly Update Final',
      summary: 'Updated summary',
      contentMd: '# Updated',
      status: 'qa',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-03T00:00:00.000Z'),
    };
    const updateBuilder = updateSetWhereReturning([updated]);
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    const res = await patchContentBySlug(
      makeRequest('PATCH', 'http://localhost/api/admin/content/weekly-update', {
        title: 'Weekly Update Final',
        summary: 'Updated summary',
        content_md: '# Updated',
        status: 'qa',
      }),
      makeContext('weekly-update'),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      ...updated,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-03T00:00:00.000Z',
    });
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Weekly Update Final',
        summary: 'Updated summary',
        contentMd: '# Updated',
        status: 'qa',
      }),
    );
  });

  it('PATCH returns 400 when status is invalid', async () => {
    const res = await patchContentBySlug(
      makeRequest('PATCH', 'http://localhost/api/admin/content/weekly-update', { status: 'archived' }),
      makeContext('weekly-update'),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid status' });
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('PATCH returns 400 when no editable fields are provided', async () => {
    const res = await patchContentBySlug(
      makeRequest('PATCH', 'http://localhost/api/admin/content/weekly-update', {}),
      makeContext('weekly-update'),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No valid fields to update' });
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('DELETE performs soft delete by setting status to deleted', async () => {
    const deleted = {
      id: 10,
      tenantId: 1,
      slug: 'weekly-update',
      title: 'Weekly Update',
      summary: 'Updated summary',
      contentMd: '# Updated',
      status: 'deleted',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-04T00:00:00.000Z'),
    };
    const updateBuilder = updateSetWhereReturning([deleted]);
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    const res = await deleteContentBySlug(
      makeRequest('DELETE', 'http://localhost/api/admin/content/weekly-update'),
      makeContext('weekly-update'),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      item: {
        ...deleted,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-04T00:00:00.000Z',
      },
    });
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'deleted',
      }),
    );
  });

  it('DELETE returns 404 when content item is missing', async () => {
    const updateBuilder = updateSetWhereReturning([]);
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    const res = await deleteContentBySlug(
      makeRequest('DELETE', 'http://localhost/api/admin/content/missing'),
      makeContext('missing'),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Content item not found' });
  });
});
