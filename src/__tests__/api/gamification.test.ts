import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { awardXp } from '@/lib/xp';
import { emitEvent } from '@/lib/activity';
import { getTenantId } from '@/lib/tenant';

import { GET as challengesGet, POST as challengesPost } from '@/app/api/gamification/challenges/route';
import { POST as completePost } from '@/app/api/gamification/challenges/[id]/complete/route';
import { GET as leaderboardGet } from '@/app/api/gamification/leaderboard/route';
import { GET as summaryGet } from '@/app/api/gamification/summary/route';

process.env.API_SECRET = 'test-api-secret';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/xp', () => ({
  awardXp: jest.fn(),
}));

jest.mock('@/lib/activity', () => ({
  emitEvent: jest.fn(),
}));

jest.mock('@/lib/tenant', () => ({
  getTenantId: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAwardXp = awardXp as unknown as jest.Mock;
const mockedEmitEvent = emitEvent as unknown as jest.Mock;
const mockedGetTenantId = getTenantId as unknown as jest.Mock;

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

function createSelectWhereOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy };
}

function createSelectWhereBuilder(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  return { from, where };
}

function createSelectWhereLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createSelectWhereOrderByLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

function createInsertReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

function createUpdateReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning };
}

describe('gamification API routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetTenantId.mockImplementation((req: NextRequest) => {
      const raw = req.headers.get('x-tenant-id');
      if (!raw) return null;
      const tenantId = Number(raw);
      return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null;
    });
  });

  describe('challenges route', () => {
    it('GET returns 401 when tenant is missing', async () => {
      const res = await challengesGet(makeRequest('http://localhost/api/gamification/challenges'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns tenant challenge rows ordered by createdAt desc', async () => {
      const rows = [{ id: 2, tenantId: 7, title: 'Deploy safely', status: 'active' }];
      const selectBuilder = createSelectWhereOrderByBuilder(rows);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await challengesGet(
        makeRequest('http://localhost/api/gamification/challenges', { headers: { 'x-tenant-id': '7' } }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual(rows);
      expect(selectBuilder.where).toHaveBeenCalled();
      expect(selectBuilder.orderBy).toHaveBeenCalled();
    });

    it('POST returns 400 when title is empty after trim', async () => {
      const res = await challengesPost(
        makeRequest('http://localhost/api/gamification/challenges', {
          headers: { 'x-tenant-id': '7' },
          body: { title: '   ', xpReward: 30 },
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'title is required' });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST creates challenge with defaults and returns 201', async () => {
      const challenge = {
        id: 8,
        tenantId: 7,
        title: 'Write docs',
        description: '',
        xpReward: 50,
        dueDate: null,
        status: 'active',
      };
      const insertBuilder = createInsertReturningBuilder([challenge]);
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await challengesPost(
        makeRequest('http://localhost/api/gamification/challenges', {
          headers: { 'x-tenant-id': '7' },
          body: { title: '  Write docs  ' },
        }),
      );

      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual(challenge);
      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 7,
          title: 'Write docs',
          description: '',
          xpReward: 50,
          dueDate: null,
          status: 'active',
        }),
      );
    });
  });

  describe('challenge complete route', () => {
    it('returns 400 when challenge id is invalid', async () => {
      const res = await completePost(
        makeRequest('http://localhost/api/gamification/challenges/abc/complete', {
          method: 'POST',
          headers: { 'x-tenant-id': '7' },
        }),
        { params: Promise.resolve({ id: 'abc' }) },
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid id' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('returns 404 when challenge is missing', async () => {
      const selectBuilder = createSelectWhereLimitBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await completePost(
        makeRequest('http://localhost/api/gamification/challenges/12/complete', {
          method: 'POST',
          headers: { 'x-tenant-id': '7' },
        }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'Challenge not found' });
    });

    it('returns completed challenge unchanged when status is already completed', async () => {
      const existing = { id: 12, tenantId: 7, title: 'Ship release', xpReward: 120, status: 'completed' };
      const selectBuilder = createSelectWhereLimitBuilder([existing]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await completePost(
        makeRequest('http://localhost/api/gamification/challenges/12/complete', {
          method: 'POST',
          headers: { 'x-tenant-id': '7' },
        }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual(existing);
      expect(mockedDb.update).not.toHaveBeenCalled();
      expect(mockedAwardXp).not.toHaveBeenCalled();
      expect(mockedEmitEvent).not.toHaveBeenCalled();
    });

    it('marks challenge as completed and emits XP and activity events', async () => {
      const selectBuilder = createSelectWhereLimitBuilder([
        { id: 12, tenantId: 7, title: 'Ship release', xpReward: 120, status: 'active' },
      ]);
      const updateBuilder = createUpdateReturningBuilder([
        { id: 12, tenantId: 7, title: 'Ship release', xpReward: 120, status: 'completed' },
      ]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
      mockedDb.update.mockReturnValueOnce(updateBuilder);

      const res = await completePost(
        makeRequest('http://localhost/api/gamification/challenges/12/complete', {
          method: 'POST',
          headers: { 'x-tenant-id': '7' },
        }),
        { params: Promise.resolve({ id: '12' }) },
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ id: 12, status: 'completed' });
      expect(mockedAwardXp).toHaveBeenCalledWith(7, 120, 'challenge_won', '12');
      expect(mockedEmitEvent).toHaveBeenCalledWith(
        7,
        'challenge_completed',
        expect.objectContaining({ challengeName: 'Ship release', challengeId: 12, xpReward: 120 }),
      );
    });
  });

  describe('leaderboard route', () => {
    it('maps execute rows into leaderboard payload with computed levels', async () => {
      mockedDb.execute.mockResolvedValueOnce({
        rows: [
          { id: 1, slug: 'alpha', totalXp: 250 },
          { id: 2, slug: 'beta', totalXp: null },
        ],
      });

      const res = await leaderboardGet();

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([
        { tenantId: 1, tenantSlug: 'alpha', totalXp: 250, level: 3 },
        { tenantId: 2, tenantSlug: 'beta', totalXp: 0, level: 1 },
      ]);
    });
  });

  describe('summary route', () => {
    it('returns 401 when tenant is missing', async () => {
      const res = await summaryGet(makeRequest('http://localhost/api/gamification/summary'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns summary with defaults when optional rows are absent', async () => {
      mockedDb.select
        .mockReturnValueOnce(createSelectWhereBuilder([]))
        .mockReturnValueOnce(createSelectWhereOrderByLimitBuilder([]))
        .mockReturnValueOnce(createSelectWhereBuilder([]));
      mockedDb.execute.mockResolvedValueOnce({ rows: [] });

      const res = await summaryGet(
        makeRequest('http://localhost/api/gamification/summary', { headers: { 'x-tenant-id': '7' } }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        totalXp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        rank: 1,
        activeChallenges: 0,
      });
    });

    it('returns computed summary fields from aggregated rows', async () => {
      mockedDb.select
        .mockReturnValueOnce(createSelectWhereBuilder([{ totalXp: 365 }]))
        .mockReturnValueOnce(createSelectWhereOrderByLimitBuilder([{ currentStreak: 8, longestStreak: 14 }]))
        .mockReturnValueOnce(createSelectWhereBuilder([{ count: 2 }]));
      mockedDb.execute.mockResolvedValueOnce({ rows: [{ rank: 4 }] });

      const res = await summaryGet(
        makeRequest('http://localhost/api/gamification/summary', { headers: { 'x-tenant-id': '7' } }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        totalXp: 365,
        level: 4,
        currentStreak: 8,
        longestStreak: 14,
        rank: 4,
        activeChallenges: 2,
      });
    });
  });
});
