import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import { GET as featureRequestsGet, POST as featureRequestsPost } from '@/app/api/feature-requests/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

function makeRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const headers = new Headers(opts.headers ?? {});
  const hasBody = opts.body !== undefined;

  if (hasBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

function createSelectOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy };
}

function createInsertValuesBuilder(result?: unknown, error?: unknown) {
  const values = error
    ? jest.fn().mockRejectedValue(error)
    : jest.fn().mockResolvedValue(result);
  return { values };
}

describe('feature requests API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET returns feature requests list', async () => {
    const rows = [
      {
        id: 2,
        email: 'second@example.com',
        description: 'Second request',
        status: 'pending',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 1,
        email: 'first@example.com',
        description: 'First request',
        status: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const selectBuilder = createSelectOrderByBuilder(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await featureRequestsGet();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      featureRequests: [
        {
          ...rows[0],
          createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
          ...rows[1],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('POST creates a new feature request', async () => {
    const insertBuilder = createInsertValuesBuilder();
    mockedDb.insert.mockReturnValueOnce(insertBuilder);

    const res = await featureRequestsPost(
      makeRequest('http://localhost/api/feature-requests', {
        body: {
          email: 'USER@Example.com',
          description: 'Please add dark mode',
        },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(insertBuilder.values).toHaveBeenCalledWith({
      email: 'user@example.com',
      description: 'Please add dark mode',
      status: 'pending',
    });
  });

  it('POST missing required fields returns 400', async () => {
    const res = await featureRequestsPost(
      makeRequest('http://localhost/api/feature-requests', {
        body: { email: 'valid@example.com' },
      }),
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload).toMatchObject({
      error: expect.stringContaining('description'),
    });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('endpoint is public (no auth required)', async () => {
    const selectBuilder = createSelectOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await featureRequestsGet();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ featureRequests: [] });
    expect(mockedDb.select).toHaveBeenCalledTimes(1);
  });
});
