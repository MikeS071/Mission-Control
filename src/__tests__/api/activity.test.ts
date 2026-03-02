import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

process.env.MC_API_SECRET = 'test-drain-secret';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/activity', () => ({
  broadcastFeedUpdate: jest.fn(),
  drainQueue: jest.fn(),
  registerFeedClient: jest.fn(),
  unregisterFeedClient: jest.fn(),
}));

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import {
  broadcastFeedUpdate,
  drainQueue,
  registerFeedClient,
  unregisterFeedClient,
} from '@/lib/activity';

import { GET as commentsGet, POST as commentsPost } from '@/app/api/activity/comments/route';
import { GET as eventsGet } from '@/app/api/activity/events/route';
import { POST as reactionsPost } from '@/app/api/activity/reactions/route';
import { POST as drainPost } from '@/app/api/activity/drain/route';
import { GET as streamGet } from '@/app/api/activity/stream/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedHeaders = headers as jest.MockedFunction<typeof headers>;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedBroadcastFeedUpdate = broadcastFeedUpdate as jest.MockedFunction<typeof broadcastFeedUpdate>;
const mockedDrainQueue = drainQueue as jest.MockedFunction<typeof drainQueue>;
const mockedRegisterFeedClient = registerFeedClient as jest.MockedFunction<typeof registerFeedClient>;
const mockedUnregisterFeedClient = unregisterFeedClient as jest.MockedFunction<typeof unregisterFeedClient>;

function setTenantHeader(value?: string) {
  const requestHeaders = new Headers();
  if (value !== undefined) {
    requestHeaders.set('x-tenant-id', value);
  }
  mockedHeaders.mockReturnValue(requestHeaders as never);
}

function makeRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
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
    signal: opts.signal,
  });
}

function createSelectInnerJoinWhereOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, where, orderBy };
}

function createSelectWhereOrderByLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

function createSelectWhereGroupByBuilder(rows: unknown[]) {
  const groupBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ groupBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, groupBy };
}

function createSelectWhereLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createInsertReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createInsertOnConflictBuilder() {
  const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  return { values, onConflictDoNothing };
}

describe('activity API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    setTenantHeader('7');
    mockedResolveTenantId.mockImplementation(async () => {
      const raw = (mockedHeaders() as unknown as Headers).get('x-tenant-id');
      if (!raw) return null;
      const id = Number(raw);
      return Number.isFinite(id) && id > 0 ? id : null;
    });
  });

  describe('comments route', () => {
    const eventId = '11111111-1111-4111-8111-111111111111';

    it('GET returns comments for a valid event', async () => {
      const rows = [
        {
          id: 'c1',
          eventId,
          tenantId: 7,
          tenantName: 'Tenant 7',
          body: 'Looks good',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      const selectBuilder = createSelectInnerJoinWhereOrderByBuilder(rows);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await commentsGet(makeRequest(`http://localhost/api/activity/comments?eventId=${eventId}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        comments: [
          {
            ...rows[0],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      expect(selectBuilder.innerJoin).toHaveBeenCalled();
      expect(selectBuilder.where).toHaveBeenCalled();
      expect(selectBuilder.orderBy).toHaveBeenCalled();
    });

    it('GET returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await commentsGet(makeRequest(`http://localhost/api/activity/comments?eventId=${eventId}`));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns 400 for invalid eventId query', async () => {
      const res = await commentsGet(makeRequest('http://localhost/api/activity/comments?eventId=not-a-uuid'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid eventId' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns empty comments array when no rows exist', async () => {
      const selectBuilder = createSelectInnerJoinWhereOrderByBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await commentsGet(makeRequest(`http://localhost/api/activity/comments?eventId=${eventId}`));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ comments: [] });
    });

    it('POST returns 400 for missing required fields', async () => {
      const res = await commentsPost(makeRequest('http://localhost/api/activity/comments', { body: { eventId } }));

      expect(res.status).toBe(400);
      const payload = await res.json();
      expect(payload).toMatchObject({ error: 'Invalid payload' });
      expect(Array.isArray(payload.issues)).toBe(true);
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('POST returns 404 when event does not exist', async () => {
      const eventLookup = createSelectWhereLimitBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: eventLookup.from });

      const res = await commentsPost(
        makeRequest('http://localhost/api/activity/comments', {
          body: { eventId, body: 'Nice work' },
        }),
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'Event not found' });
    });

    it('POST returns 500 when insert does not return a comment row', async () => {
      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 42 }]);
      const commentInsert = createInsertReturningBuilder([]);

      mockedDb.select.mockReturnValueOnce({ from: eventLookup.from });
      mockedDb.insert.mockReturnValueOnce(commentInsert);

      const res = await commentsPost(
        makeRequest('http://localhost/api/activity/comments', {
          body: { eventId, body: 'Nice work' },
        }),
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: 'Insert failed' });
      expect(mockedBroadcastFeedUpdate).not.toHaveBeenCalled();
    });

    it('POST creates comment and broadcasts to owner and commenter tenants', async () => {
      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 42 }]);
      const commentRow = {
        id: 'comment-1',
        eventId,
        tenantId: 7,
        body: 'Huge milestone',
        createdAt: new Date('2026-01-01T01:00:00.000Z'),
      };
      const commentInsert = createInsertReturningBuilder([commentRow]);
      const tenantLookup = createSelectWhereLimitBuilder([{ name: 'Tenant Seven' }]);

      mockedDb.select
        .mockReturnValueOnce({ from: eventLookup.from })
        .mockReturnValueOnce({ from: tenantLookup.from });
      mockedDb.insert.mockReturnValueOnce(commentInsert);

      const res = await commentsPost(
        makeRequest('http://localhost/api/activity/comments', {
          body: { eventId, body: 'Huge milestone' },
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json).toEqual({
        ok: true,
        comment: {
          ...commentRow,
          createdAt: '2026-01-01T01:00:00.000Z',
          tenantName: 'Tenant Seven',
        },
      });
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledTimes(2);
      expect(mockedBroadcastFeedUpdate).toHaveBeenNthCalledWith(
        1,
        42,
        'activity.comment.created',
        expect.objectContaining({ id: 'comment-1', tenantName: 'Tenant Seven' }),
      );
      expect(mockedBroadcastFeedUpdate).toHaveBeenNthCalledWith(
        2,
        7,
        'activity.comment.created',
        expect.objectContaining({ id: 'comment-1', tenantName: 'Tenant Seven' }),
      );
    });

    it('POST defaults tenantName to Unknown when lookup is empty', async () => {
      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 7 }]);
      const commentInsert = createInsertReturningBuilder([
        {
          id: 'comment-2',
          eventId,
          tenantId: 7,
          body: 'Fallback name',
          createdAt: new Date('2026-01-02T01:00:00.000Z'),
        },
      ]);
      const tenantLookup = createSelectWhereLimitBuilder([]);

      mockedDb.select
        .mockReturnValueOnce({ from: eventLookup.from })
        .mockReturnValueOnce({ from: tenantLookup.from });
      mockedDb.insert.mockReturnValueOnce(commentInsert);

      const res = await commentsPost(
        makeRequest('http://localhost/api/activity/comments', {
          body: { eventId, body: 'Fallback name' },
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.comment.tenantName).toBe('Unknown');
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledTimes(1);
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(
        7,
        'activity.comment.created',
        expect.objectContaining({ tenantName: 'Unknown' }),
      );
    });
  });

  describe('events route', () => {
    it('GET returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await eventsGet(makeRequest('http://localhost/api/activity/events'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET returns 401 when tenant header is invalid', async () => {
      setTenantHeader('invalid-tenant');

      const res = await eventsGet(makeRequest('http://localhost/api/activity/events'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('GET returns 400 for invalid query params', async () => {
      const res = await eventsGet(makeRequest('http://localhost/api/activity/events?limit=0'));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toMatchObject({ error: 'Invalid query params' });
      expect(Array.isArray(json.issues)).toBe(true);
    });

    it('GET returns enriched events with reaction and comment counts', async () => {
      const firstEvent = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenantId: 7,
        eventType: 'badge_earned',
        displayName: 'Badge earned',
        description: 'Milestone',
        icon: '🏅',
        payloadJson: {},
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      };
      const secondEvent = {
        ...firstEvent,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      };

      const eventsBuilder = createSelectWhereOrderByLimitBuilder([firstEvent, secondEvent]);
      const reactionsBuilder = createSelectWhereGroupByBuilder([
        { eventId: firstEvent.id, reactionType: 'hype', count: 2 },
        { eventId: firstEvent.id, reactionType: 'respect', count: 1 },
      ]);
      const commentsBuilder = createSelectWhereGroupByBuilder([{ eventId: firstEvent.id, count: 3 }]);

      mockedDb.select
        .mockReturnValueOnce({ from: eventsBuilder.from })
        .mockReturnValueOnce({ from: reactionsBuilder.from })
        .mockReturnValueOnce({ from: commentsBuilder.from });

      const res = await eventsGet(makeRequest('http://localhost/api/activity/events?limit=1'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        events: [
          {
            ...firstEvent,
            createdAt: '2026-01-04T00:00:00.000Z',
            reactions: { hype: 2, respect: 1, tribute: 0 },
            commentCount: 3,
          },
        ],
        nextCursor: '2026-01-04T00:00:00.000Z',
      });
    });

    it('GET returns empty payload when no events exist', async () => {
      const eventsBuilder = createSelectWhereOrderByLimitBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: eventsBuilder.from });

      const res = await eventsGet(makeRequest('http://localhost/api/activity/events'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ events: [], nextCursor: null });
      expect(mockedDb.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('reactions route', () => {
    const eventId = '33333333-3333-4333-8333-333333333333';

    it('POST returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId, reactionType: 'hype' },
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('POST returns 400 for invalid payload', async () => {
      const res = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId: 'bad', reactionType: 'wave' },
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toMatchObject({ error: 'Invalid payload' });
      expect(Array.isArray(json.issues)).toBe(true);
    });

    it('POST returns 404 when event does not exist', async () => {
      const eventLookup = createSelectWhereLimitBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: eventLookup.from });

      const res = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId, reactionType: 'hype' },
        }),
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'Event not found' });
    });

    it('POST returns 400 on self reaction', async () => {
      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 7 }]);
      mockedDb.select.mockReturnValueOnce({ from: eventLookup.from });

      const res = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId, reactionType: 'tribute' },
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Cannot react to your own event' });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST records reaction and returns updated totals', async () => {
      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 42 }]);
      const countsLookup = createSelectWhereGroupByBuilder([
        { reactionType: 'hype', count: 3 },
        { reactionType: 'respect', count: 2 },
      ]);
      const insertBuilder = createInsertOnConflictBuilder();

      mockedDb.select
        .mockReturnValueOnce({ from: eventLookup.from })
        .mockReturnValueOnce({ from: countsLookup.from });
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId, reactionType: 'hype' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        ok: true,
        counts: { hype: 3, respect: 2, tribute: 0 },
      });
      expect(insertBuilder.values).toHaveBeenCalledWith({ eventId, fromTenantId: 7, reactionType: 'hype' });
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(
        42,
        'activity.reaction.updated',
        {
          eventId,
          fromTenantId: 7,
          reactionType: 'hype',
          counts: { hype: 3, respect: 2, tribute: 0 },
        },
      );
    });

    it('POST returns 429 when per-tenant reaction limit is exceeded', async () => {
      const tenantId = 99;
      mockedResolveTenantId.mockResolvedValue(tenantId);

      for (let i = 0; i < 10; i++) {
        const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 42 }]);
        const countsLookup = createSelectWhereGroupByBuilder([{ reactionType: 'hype', count: i + 1 }]);
        const insertBuilder = createInsertOnConflictBuilder();

        mockedDb.select
          .mockReturnValueOnce({ from: eventLookup.from })
          .mockReturnValueOnce({ from: countsLookup.from });
        mockedDb.insert.mockReturnValueOnce(insertBuilder);

        const okRes = await reactionsPost(
          makeRequest('http://localhost/api/activity/reactions', {
            body: { eventId, reactionType: 'hype' },
          }),
        );

        expect(okRes.status).toBe(200);
      }

      const eventLookup = createSelectWhereLimitBuilder([{ tenantId: 42 }]);
      mockedDb.select.mockReturnValueOnce({ from: eventLookup.from });

      const limitedRes = await reactionsPost(
        makeRequest('http://localhost/api/activity/reactions', {
          body: { eventId, reactionType: 'hype' },
        }),
      );
      const json = await limitedRes.json();

      expect(limitedRes.status).toBe(429);
      expect(json).toEqual({ error: 'Rate limit exceeded' });
      expect(Number(limitedRes.headers.get('retry-after'))).toBeGreaterThan(0);
    });
  });

  describe('drain route', () => {
    it('POST returns 403 when secret is missing or invalid', async () => {
      const res = await drainPost(makeRequest('http://localhost/api/activity/drain', { method: 'POST' }));

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
      expect(mockedDrainQueue).not.toHaveBeenCalled();
    });

    it('POST drains events for a tenant and broadcasts each created event', async () => {
      mockedDrainQueue.mockResolvedValueOnce([
        { id: 'e1', tenantId: 7, createdAt: new Date('2026-01-01T00:00:00.000Z') } as never,
        { id: 'e2', tenantId: 7, createdAt: new Date('2026-01-01T00:01:00.000Z') } as never,
        { id: 'e3', tenantId: 8, createdAt: new Date('2026-01-01T00:02:00.000Z') } as never,
      ]);

      const res = await drainPost(
        makeRequest('http://localhost/api/activity/drain?tenantId=7', {
          method: 'POST',
          headers: { 'x-drain-secret': 'test-drain-secret' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, created: 3 });
      expect(mockedDrainQueue).toHaveBeenCalledWith(7);
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledTimes(3);
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(7, 'activity.event.created', expect.objectContaining({ id: 'e1' }));
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(7, 'activity.event.created', expect.objectContaining({ id: 'e2' }));
      expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(8, 'activity.event.created', expect.objectContaining({ id: 'e3' }));
    });

    it('POST treats invalid tenantId query as undefined and handles empty drain result', async () => {
      mockedDrainQueue.mockResolvedValueOnce([]);

      const res = await drainPost(
        makeRequest('http://localhost/api/activity/drain?tenantId=not-a-number', {
          method: 'POST',
          headers: { 'x-drain-secret': 'test-drain-secret' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, created: 0 });
      expect(mockedDrainQueue).toHaveBeenCalledWith(undefined);
      expect(mockedBroadcastFeedUpdate).not.toHaveBeenCalled();
    });
  });

  describe('stream route', () => {
    it('GET returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await streamGet(makeRequest('http://localhost/api/activity/stream'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedRegisterFeedClient).not.toHaveBeenCalled();
    });

    it('GET opens SSE stream, sends keepalive, and unregisters on abort', async () => {
      const controller = new AbortController();
      const req = makeRequest('http://localhost/api/activity/stream', { signal: controller.signal });

      const res = await streamGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(res.headers.get('connection')).toBe('keep-alive');

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      const firstChunk = await reader!.read();
      const decoded = new TextDecoder().decode(firstChunk.value);

      expect(decoded).toBe(': keepalive\n\n');
      expect(mockedRegisterFeedClient).toHaveBeenCalledTimes(1);
      expect(mockedRegisterFeedClient).toHaveBeenCalledWith(7, expect.anything());

      const registeredController = mockedRegisterFeedClient.mock.calls[0]?.[1];
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockedUnregisterFeedClient).toHaveBeenCalledWith(7, registeredController);
      await reader!.cancel();
    });
  });
});
