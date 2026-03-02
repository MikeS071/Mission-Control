import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/arena-reactions', () => ({
  subscribeToArenaReactionEvents: jest.fn(),
}));

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { subscribeToArenaReactionEvents } from '@/lib/arena-reactions';

import { GET as getTasksStream } from '@/app/api/tasks/stream/route';
import { GET as getArenaReactionsStream } from '@/app/api/arena/reactions/stream/route';
import { GET as getProgressSummary } from '@/app/api/arena/progress-summary/route';

type MockDb = {
  select: jest.Mock;
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedSubscribeToArenaReactionEvents =
  subscribeToArenaReactionEvents as jest.MockedFunction<typeof subscribeToArenaReactionEvents>;

function makeRequest(url: string, signal?: AbortSignal): NextRequest {
  return new NextRequest(url, { method: 'GET', signal });
}

function createSelectWhereLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createSelectWhereOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy };
}

describe('streams + arena misc API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
    mockedSubscribeToArenaReactionEvents.mockReturnValue(jest.fn());
  });

  it('GET tasks stream returns SSE headers', async () => {
    const selectBuilder = createSelectWhereOrderByBuilder([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const controller = new AbortController();
    const res = await getTasksStream(makeRequest('http://localhost/api/tasks/stream', controller.signal));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('connection')).toBe('keep-alive');

    const reader = res.body?.getReader();
    await reader?.read();
    controller.abort();
    await reader?.cancel();
  });

  it('GET arena reactions stream returns SSE headers', async () => {
    const controller = new AbortController();
    const res = await getArenaReactionsStream(
      makeRequest('http://localhost/api/arena/reactions/stream', controller.signal),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('connection')).toBe('keep-alive');
    expect(mockedSubscribeToArenaReactionEvents).toHaveBeenCalledTimes(1);

    const reader = res.body?.getReader();
    controller.abort();
    await reader?.cancel();
  });

  it('GET progress summary returns data', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ total_xp: 1234 }] })
      .mockResolvedValueOnce({ rows: [{ total: 11 }] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 350 }] })
      .mockResolvedValueOnce({ rows: [{ challenge_key: 'first_task', unlocked_at: '2026-01-01T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const selectBuilder = createSelectWhereLimitBuilder([
      {
        current: 5,
        longest: 8,
        freezeCharges: 1,
      },
    ]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const res = await getProgressSummary(makeRequest('http://localhost/api/arena/progress-summary'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      totalXp: 1234,
      totalTasksDone: 11,
      longestStreak: 8,
      streak: {
        current: 5,
        longest: 8,
        freezeCharges: 1,
      },
      arcsCompleted: 1,
    });
    expect(Array.isArray(json.milestones)).toBe(true);
    expect(json.milestones.length).toBeGreaterThan(0);
  });

  it('Missing auth returns 401', async () => {
    mockedResolveTenantId.mockResolvedValue(null);

    const tasksRes = await getTasksStream(makeRequest('http://localhost/api/tasks/stream'));
    expect(tasksRes.status).toBe(401);
    await expect(tasksRes.json()).resolves.toEqual({ error: 'Unauthorized' });

    const arenaReactionsRes = await getArenaReactionsStream(
      makeRequest('http://localhost/api/arena/reactions/stream'),
    );
    expect(arenaReactionsRes.status).toBe(401);
    await expect(arenaReactionsRes.text()).resolves.toBe('Unauthorized');

    const progressSummaryRes = await getProgressSummary(
      makeRequest('http://localhost/api/arena/progress-summary'),
    );
    expect(progressSummaryRes.status).toBe(401);
    await expect(progressSummaryRes.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
