import type { NextRequest } from 'next/server';

process.env.API_SECRET = 'test-api-secret';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import { GET as listInsights, POST as createInsight } from '@/app/api/insights/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function selectOrderByLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy, limit };
}

function insertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

describe('insights API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/insights returns list', async () => {
    const rows = [
      {
        id: 1,
        slug: 'weekly-ops-update',
        title: 'Weekly Ops Update',
        description: 'Summary',
        imageUrl: null,
        sourceUrl: null,
        publishedAt: new Date('2026-01-05T00:00:00.000Z'),
        createdAt: new Date('2026-01-05T01:00:00.000Z'),
      },
    ];
    const selectBuilder = selectOrderByLimit(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const req = makeRequest('GET', 'http://localhost/api/insights?limit=20');
    const res = await listInsights(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      {
        ...rows[0],
        publishedAt: '2026-01-05T00:00:00.000Z',
        createdAt: '2026-01-05T01:00:00.000Z',
      },
    ]);
    expect(selectBuilder.orderBy).toHaveBeenCalled();
    expect(selectBuilder.limit).toHaveBeenCalledWith(20);
  });

  it('POST /api/insights with valid Bearer token creates insight', async () => {
    const created = {
      id: 9,
      slug: 'new-insight',
      title: 'New Insight',
      description: 'A short summary',
      contentMd: 'Markdown body',
      publishedAt: new Date('2026-01-10T00:00:00.000Z'),
      createdAt: new Date('2026-01-10T00:00:01.000Z'),
    };
    const insertBuilder = insertReturning([created]);
    mockedDb.insert.mockReturnValueOnce(insertBuilder);

    const req = makeRequest(
      'POST',
      'http://localhost/api/insights',
      {
        title: 'New Insight',
        slug: 'new-insight',
        summary: 'A short summary',
        content: 'Markdown body',
        publishedAt: '2026-01-10T00:00:00.000Z',
      },
      { authorization: 'Bearer test-api-secret' },
    );

    const res = await createInsight(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual({
      ...created,
      publishedAt: '2026-01-10T00:00:00.000Z',
      createdAt: '2026-01-10T00:00:01.000Z',
    });
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'new-insight',
        title: 'New Insight',
        description: 'A short summary',
        contentMd: 'Markdown body',
      }),
    );
  });

  it('POST without auth returns 401', async () => {
    const req = makeRequest('POST', 'http://localhost/api/insights', {
      title: 'No Auth',
      slug: 'no-auth',
      summary: 'Summary',
      content: 'Body',
    });

    const res = await createInsight(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('POST with missing required fields returns 400', async () => {
    const req = makeRequest(
      'POST',
      'http://localhost/api/insights',
      {
        slug: 'missing-title',
        summary: 'Summary only',
        content: 'Body only',
      },
      { authorization: 'Bearer test-api-secret' },
    );

    const res = await createInsight(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'title is required' });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});
