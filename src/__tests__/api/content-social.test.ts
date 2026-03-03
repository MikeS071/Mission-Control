import type { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { GET as contentSocialGet, POST as contentSocialPost } from '@/app/api/admin/content/[slug]/social/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

function makeRequest(options: {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
}): NextRequest {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  return new Request(options.url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }) as unknown as NextRequest;
}

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function selectWhereOrderBy(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy };
}

function insertValuesReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

describe('admin content social API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET lists social posts for a content slug', async () => {
    const contentLookup = selectWhereLimit([{ id: 42, publishedAt: new Date('2026-02-01T00:00:00.000Z') }]);
    const postsLookup = selectWhereOrderBy([
      {
        platform: 'x',
        text: 'Ship update',
        scheduledAt: new Date('2026-03-10T12:00:00.000Z'),
        status: 'scheduled',
      },
    ]);

    mockedDb.select
      .mockReturnValueOnce({ from: contentLookup.from })
      .mockReturnValueOnce({ from: postsLookup.from });

    const res = await contentSocialGet(
      makeRequest({ method: 'GET', url: 'http://localhost/api/admin/content/ship-update/social' }),
      { params: Promise.resolve({ slug: 'ship-update' }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        platform: 'x',
        text: 'Ship update',
        scheduledAt: '2026-03-10T12:00:00.000Z',
        status: 'scheduled',
      },
    ]);
    expect(postsLookup.orderBy).toHaveBeenCalled();
  });

  it('POST schedules a social post when content is published', async () => {
    const contentLookup = selectWhereLimit([{ id: 42, publishedAt: new Date('2026-02-01T00:00:00.000Z') }]);
    const insertBuilder = insertValuesReturning([
      {
        platform: 'linkedin',
        text: 'Launch recap',
        scheduledAt: new Date('2026-03-12T08:30:00.000Z'),
        status: 'scheduled',
      },
    ]);

    mockedDb.select.mockReturnValueOnce({ from: contentLookup.from });
    mockedDb.insert.mockReturnValueOnce(insertBuilder);

    const res = await contentSocialPost(
      makeRequest({
        method: 'POST',
        url: 'http://localhost/api/admin/content/ship-update/social',
        body: {
          platform: 'linkedin',
          text: 'Launch recap',
          scheduledAt: '2026-03-12T08:30:00.000Z',
        },
      }),
      { params: Promise.resolve({ slug: 'ship-update' }) },
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      platform: 'linkedin',
      text: 'Launch recap',
      scheduledAt: '2026-03-12T08:30:00.000Z',
      status: 'scheduled',
    });
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'linkedin',
        text: 'Launch recap',
        status: 'scheduled',
      }),
    );
  });

  it('POST rejects scheduling when content is not yet published', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const contentLookup = selectWhereLimit([{ id: 42, publishedAt: future }]);
    mockedDb.select.mockReturnValueOnce({ from: contentLookup.from });

    const res = await contentSocialPost(
      makeRequest({
        method: 'POST',
        url: 'http://localhost/api/admin/content/ship-update/social',
        body: {
          platform: 'x',
          text: 'Coming soon',
          scheduledAt: '2026-03-12T08:30:00.000Z',
        },
      }),
      { params: Promise.resolve({ slug: 'ship-update' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Content item must be published before scheduling social posts' });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('POST rejects invalid payload', async () => {
    const res = await contentSocialPost(
      makeRequest({
        method: 'POST',
        url: 'http://localhost/api/admin/content/ship-update/social',
        body: { platform: 'mastodon', text: '', scheduledAt: 'not-a-date' },
      }),
      { params: Promise.resolve({ slug: 'ship-update' }) },
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload).toMatchObject({ error: 'Invalid payload' });
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('GET returns 401 without a session', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await contentSocialGet(
      makeRequest({ method: 'GET', url: 'http://localhost/api/admin/content/ship-update/social' }),
      { params: Promise.resolve({ slug: 'ship-update' }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });
});
