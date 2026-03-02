import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/activity', () => ({
  drainQueue: jest.fn(),
  broadcastFeedUpdate: jest.fn(),
  registerFeedClient: jest.fn(),
  unregisterFeedClient: jest.fn(),
}));

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  drainQueue,
  broadcastFeedUpdate,
  registerFeedClient,
  unregisterFeedClient,
} from '@/lib/activity';
import { GET as getEvents } from '@/app/api/activity/events/route';
import { POST as postComments } from '@/app/api/activity/comments/route';
import { POST as postReactions } from '@/app/api/activity/reactions/route';
import { GET as getStream } from '@/app/api/activity/stream/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  execute: jest.Mock;
  transaction: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedDrainQueue = drainQueue as unknown as jest.Mock;
const mockedBroadcastFeedUpdate = broadcastFeedUpdate as unknown as jest.Mock;
const mockedRegisterFeedClient = registerFeedClient as unknown as jest.Mock;
const mockedUnregisterFeedClient = unregisterFeedClient as unknown as jest.Mock;

function req(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): NextRequest {
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

function mockSelectWhereOrderByLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, orderBy, limit };
}

function mockSelectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockSelectWhereGroupBy(rows: unknown[]) {
  const groupBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ groupBy });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, groupBy };
}

function mockInsertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

function mockInsertOnConflictDoNothing() {
  const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoNothing });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, onConflictDoNothing };
}

const eventIdA = '11111111-1111-4111-8111-111111111111';
const eventIdB = '22222222-2222-4222-8222-222222222222';

let postDrain: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MC_API_SECRET = 'drain-secret';
  ({ POST: postDrain } = await import('@/app/api/activity/drain/route'));
});

describe('activity API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue(null);
    mockedDrainQueue.mockResolvedValue([]);
  });

  it('blocks events listing when unauthorized', async () => {
    const res = await getEvents(req('http://localhost/api/activity/events'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedAuth).toHaveBeenCalled();
  });

  it('lists events with pagination and enrichment counts', async () => {
    const createdAt1 = new Date('2026-01-03T00:00:00.000Z');
    const createdAt2 = new Date('2026-01-02T00:00:00.000Z');
    const createdAt3 = new Date('2026-01-01T00:00:00.000Z');

    const eventsQuery = mockSelectWhereOrderByLimit([
      {
        id: eventIdA,
        tenantId: 7,
        eventType: 'badge_earned',
        displayName: 'Badge earned',
        description: 'A badge was earned',
        icon: '🏅',
        payloadJson: {},
        createdAt: createdAt1,
      },
      {
        id: eventIdB,
        tenantId: 7,
        eventType: 'xp_rank_up',
        displayName: 'Rank up',
        description: 'Agent ranked up',
        icon: '⬆️',
        payloadJson: {},
        createdAt: createdAt2,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        tenantId: 7,
        eventType: 'tasks_burst',
        displayName: 'Task burst',
        description: 'Several tasks completed',
        icon: '⚡',
        payloadJson: {},
        createdAt: createdAt3,
      },
    ]);

    mockSelectWhereGroupBy([
      { eventId: eventIdA, reactionType: 'hype', count: 2 },
      { eventId: eventIdA, reactionType: 'respect', count: 1 },
      { eventId: eventIdB, reactionType: 'tribute', count: 3 },
    ]);

    mockSelectWhereGroupBy([{ eventId: eventIdB, count: 4 }]);

    const res = await getEvents(req('http://localhost/api/activity/events?limit=2', { headers: { 'x-tenant-id': '7' } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(eventsQuery.limit).toHaveBeenCalledWith(3);
    expect(json.nextCursor).toBe(createdAt2.toISOString());
    expect(json.events).toHaveLength(2);
    expect(json.events[0]).toEqual(
      expect.objectContaining({
        id: eventIdA,
        reactions: { hype: 2, respect: 1, tribute: 0 },
        commentCount: 0,
      }),
    );
    expect(json.events[1]).toEqual(
      expect.objectContaining({
        id: eventIdB,
        reactions: { hype: 0, respect: 0, tribute: 3 },
        commentCount: 4,
      }),
    );
  });

  it('rejects invalid events list query params', async () => {
    const res = await getEvents(req('http://localhost/api/activity/events?limit=0', { headers: { 'x-tenant-id': '7' } }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({ error: 'Invalid query params' });
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it('blocks comment posting when unauthorized', async () => {
    const res = await postComments(
      req('http://localhost/api/activity/comments', {
        method: 'POST',
        body: { eventId: eventIdA, body: 'Looks good' },
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('posts a comment and broadcasts updates to relevant tenants', async () => {
    const eventLookup = mockSelectWhereLimit([{ tenantId: 9 }]);
    const insertComment = mockInsertReturning([
      {
        id: '44444444-4444-4444-8444-444444444444',
        eventId: eventIdA,
        tenantId: 7,
        body: 'Congrats',
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ]);
    mockSelectWhereLimit([{ name: 'Tenant Seven' }]);

    const res = await postComments(
      req('http://localhost/api/activity/comments', {
        method: 'POST',
        headers: { 'x-tenant-id': '7' },
        body: { eventId: eventIdA, body: 'Congrats' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(eventLookup.limit).toHaveBeenCalledWith(1);
    expect(insertComment.values).toHaveBeenCalledWith({
      eventId: eventIdA,
      tenantId: 7,
      body: 'Congrats',
    });
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        comment: expect.objectContaining({
          eventId: eventIdA,
          tenantId: 7,
          tenantName: 'Tenant Seven',
        }),
      }),
    );
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledTimes(2);
    expect(mockedBroadcastFeedUpdate).toHaveBeenNthCalledWith(
      1,
      9,
      'activity.comment.created',
      expect.objectContaining({ eventId: eventIdA, body: 'Congrats' }),
    );
    expect(mockedBroadcastFeedUpdate).toHaveBeenNthCalledWith(
      2,
      7,
      'activity.comment.created',
      expect.objectContaining({ eventId: eventIdA, body: 'Congrats' }),
    );
  });

  it('accepts reaction post (toggle endpoint) and returns updated totals', async () => {
    mockSelectWhereLimit([{ tenantId: 9 }]);
    const insertReaction = mockInsertOnConflictDoNothing();
    mockSelectWhereGroupBy([
      { reactionType: 'hype', count: 2 },
      { reactionType: 'tribute', count: 1 },
    ]);

    const res = await postReactions(
      req('http://localhost/api/activity/reactions', {
        method: 'POST',
        headers: { 'x-tenant-id': '7' },
        body: { eventId: eventIdA, reactionType: 'respect' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(insertReaction.values).toHaveBeenCalledWith({
      eventId: eventIdA,
      fromTenantId: 7,
      reactionType: 'respect',
    });
    expect(insertReaction.onConflictDoNothing).toHaveBeenCalled();
    expect(json).toEqual({
      ok: true,
      counts: { hype: 2, respect: 0, tribute: 1 },
    });
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(
      9,
      'activity.reaction.updated',
      expect.objectContaining({
        eventId: eventIdA,
        fromTenantId: 7,
        reactionType: 'respect',
        counts: { hype: 2, respect: 0, tribute: 1 },
      }),
    );
  });

  it('rejects drain requests when secret does not match', async () => {
    const res = await postDrain(
      req('http://localhost/api/activity/drain', {
        method: 'POST',
        headers: { 'x-drain-secret': 'wrong-secret' },
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(mockedDrainQueue).not.toHaveBeenCalled();
  });

  it('drains queue for a tenant and broadcasts created events', async () => {
    mockedDrainQueue.mockResolvedValueOnce([
      { id: eventIdA, tenantId: 7, eventType: 'badge_earned' },
      { id: eventIdB, tenantId: 7, eventType: 'xp_rank_up' },
      { id: '33333333-3333-4333-8333-333333333333', tenantId: 9, eventType: 'tasks_burst' },
    ]);

    const res = await postDrain(
      req('http://localhost/api/activity/drain?tenantId=7', {
        method: 'POST',
        headers: { 'x-drain-secret': 'drain-secret' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockedDrainQueue).toHaveBeenCalledWith(7);
    expect(json).toEqual({ ok: true, created: 3 });
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledTimes(3);
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(7, 'activity.event.created', expect.objectContaining({ id: eventIdA }));
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(7, 'activity.event.created', expect.objectContaining({ id: eventIdB }));
    expect(mockedBroadcastFeedUpdate).toHaveBeenCalledWith(
      9,
      'activity.event.created',
      expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333' }),
    );
  });

  it('blocks SSE stream when unauthorized', async () => {
    const res = await getStream(req('http://localhost/api/activity/stream'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns SSE headers and registers/unregisters feed clients', async () => {
    const abortController = new AbortController();
    const request = req('http://localhost/api/activity/stream', {
      headers: { 'x-tenant-id': '7' },
      signal: abortController.signal,
    });

    const res = await getStream(request);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
    expect(mockedRegisterFeedClient).toHaveBeenCalledWith(7, expect.anything());

    abortController.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedUnregisterFeedClient).toHaveBeenCalledWith(7, expect.anything());
  });
});
