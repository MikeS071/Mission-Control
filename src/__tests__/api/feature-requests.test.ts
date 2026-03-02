import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { POST as featureRequestsPost } from '@/app/api/feature-requests/route';

type MockDb = {
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;

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

function createInsertValuesBuilder() {
  const values = jest.fn().mockResolvedValue(undefined);
  return { values };
}

describe('feature-requests API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
  });

  it('POST with valid body creates a feature request', async () => {
    const insertBuilder = createInsertValuesBuilder();
    mockedDb.insert.mockReturnValueOnce(insertBuilder);

    const res = await featureRequestsPost(
      makeRequest('http://localhost/api/feature-requests', {
        body: {
          email: 'User@Example.COM',
          description: 'Please add export support',
        },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(insertBuilder.values).toHaveBeenCalledWith({
      email: 'user@example.com',
      description: 'Please add export support',
      status: 'pending',
    });
  });

  it('POST with missing required fields returns 400', async () => {
    const res = await featureRequestsPost(
      makeRequest('http://localhost/api/feature-requests', {
        body: {
          email: 'user@example.com',
        },
      }),
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload).toMatchObject({ error: expect.any(String) });
    expect(String(payload.error)).toContain('description');
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('POST without tenant context returns 401', async () => {
    mockedResolveTenantId.mockResolvedValueOnce(null);

    const res = await featureRequestsPost(
      makeRequest('http://localhost/api/feature-requests', {
        body: {
          email: 'user@example.com',
          description: 'Need custom webhooks',
        },
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });
});
