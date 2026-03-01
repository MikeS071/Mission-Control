import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { awardXp } from '@/lib/xp';
import { emitEvent } from '@/lib/activity';
import {
  emitArenaReactionCreated,
  enforceArenaReactionCooldown,
  enforceArenaReactionRateLimit,
} from '@/lib/arena-reactions';
import { GET as getArenaChallenges } from '@/app/api/arena/challenges/route';
import { POST as postArenaClaim } from '@/app/api/arena/claim/route';
import { GET as getArenaStreak } from '@/app/api/arena/streak/route';
import { POST as postArenaReactions } from '@/app/api/arena/reactions/route';
import { GET as getArenaProgressSummary } from '@/app/api/arena/progress-summary/route';
import { GET as getArenaSeason } from '@/app/api/arena/season/route';
import { POST as postGamificationChallengeComplete } from '@/app/api/gamification/challenges/[id]/complete/route';
import { GET as getGamificationLeaderboard } from '@/app/api/gamification/leaderboard/route';
import { GET as getGamificationSummary } from '@/app/api/gamification/summary/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/xp', () => ({
  awardXp: jest.fn(),
}));

jest.mock('@/lib/activity', () => ({
  emitEvent: jest.fn(),
}));

jest.mock('@/lib/arena-reactions', () => {
  const actual = jest.requireActual('@/lib/arena-reactions');
  return {
    ...actual,
    enforceArenaReactionRateLimit: jest.fn(),
    enforceArenaReactionCooldown: jest.fn(),
    emitArenaReactionCreated: jest.fn(),
  };
});

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  execute: jest.Mock;
  transaction: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;
const mockedAwardXp = awardXp as unknown as jest.Mock;
const mockedEmitEvent = emitEvent as unknown as jest.Mock;
const mockedRateLimit = enforceArenaReactionRateLimit as unknown as jest.Mock;
const mockedCooldown = enforceArenaReactionCooldown as unknown as jest.Mock;
const mockedEmitArenaReactionCreated = emitArenaReactionCreated as unknown as jest.Mock;

function makeGetRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, { method: 'GET', headers: new Headers(headers ?? {}) });
}

function makePostRequest(url: string, body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', ...(headers ?? {}) }),
    body: JSON.stringify(body),
  });
}

function createSelectLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit } as any;
}

function createSelectInnerJoinLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ innerJoin });
  return { from, innerJoin, where, limit } as any;
}

function createSelectWhereBuilder(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  return { from, where } as any;
}

function createSelectOrderByLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit } as any;
}

function createUpdateReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning } as any;
}

describe('arena + gamification API routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    mockedAuth.mockResolvedValue(null as any);
    mockedRateLimit.mockReturnValue({ ok: true });
    mockedCooldown.mockReturnValue({ ok: true });
  });

  it('lists arena challenges grouped by type', async () => {
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        { id: 1, type: 'daily', title: 'D1' },
        { id: 2, type: 'weekly', title: 'W1' },
        { id: 3, type: 'seasonal', title: 'S1' },
      ],
    });

    const res = await getArenaChallenges(makeGetRequest('http://localhost/api/arena/challenges', { 'x-tenant-id': '7' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      daily: [{ id: 1, type: 'daily', title: 'D1' }],
      weekly: [{ id: 2, type: 'weekly', title: 'W1' }],
      seasonal: [{ id: 3, type: 'seasonal', title: 'S1' }],
    });
  });

  it('returns unauthorized when arena challenge list has no tenant context', async () => {
    const res = await getArenaChallenges(makeGetRequest('http://localhost/api/arena/challenges'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('claims an arena reward and emits badge event', async () => {
    mockedDb.select.mockReturnValueOnce(
      createSelectInnerJoinLimitBuilder([
        {
          progress: { id: 11, challengeId: 5, status: 'completed', rewardXpAwarded: null },
          rewardXp: 80,
        },
      ])
    );
    mockedDb.update.mockReturnValueOnce(createUpdateReturningBuilder([{ rewardXpAwarded: 80 }]));

    const res = await postArenaClaim(
      makePostRequest('http://localhost/api/arena/claim', { progressId: 11 }, { 'x-tenant-id': '7' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, xp_awarded: 80 });
    expect(mockedEmitEvent).toHaveBeenCalledWith(
      7,
      'badge_earned',
      expect.objectContaining({
        badgeName: 'Arena Challenge #5',
        xpAwarded: 80,
      })
    );
  });

  it('rejects claim requests with invalid progressId', async () => {
    const res = await postArenaClaim(
      makePostRequest('http://localhost/api/arena/claim', { progressId: 'oops' }, { 'x-tenant-id': '7' })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid progressId' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('returns streak data with multiplier when tenant is resolved from auth session', async () => {
    mockedAuth.mockResolvedValueOnce({ tenantId: 22 } as any);
    mockedDb.select.mockReturnValueOnce(
      createSelectLimitBuilder([
        {
          currentStreakDays: 14,
          longestStreakDays: 30,
          freezeCharges: 2,
          lastQualifiedOn: '2026-01-09',
        },
      ])
    );

    const res = await getArenaStreak(makeGetRequest('http://localhost/api/arena/streak'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      current_streak_days: 14,
      longest_streak_days: 30,
      xp_multiplier: 1.2,
      freeze_charges: 2,
      last_qualified_on: '2026-01-09',
    });
  });

  it('posts an arena reaction and returns updated counters', async () => {
    const txInsert = jest.fn();
    const firstValues = jest.fn().mockResolvedValue(undefined);
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const secondValues = jest.fn().mockReturnValue({ onConflictDoUpdate });
    txInsert.mockReturnValueOnce({ values: firstValues }).mockReturnValueOnce({ values: secondValues });
    mockedDb.transaction.mockImplementationOnce(async (cb: any) => cb({ insert: txInsert }));

    mockedDb.select.mockReturnValueOnce(createSelectLimitBuilder([{ tribute: 2, respect: 4, hype: 1 }]));

    const res = await postArenaReactions(
      makePostRequest(
        'http://localhost/api/arena/reactions',
        { toTenantId: 12, reactionType: 'respect' },
        { 'x-tenant-id': '7' }
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      counts: { tribute: 2, respect: 4, hype: 1 },
    });
    expect(mockedRateLimit).toHaveBeenCalledWith(7);
    expect(mockedCooldown).toHaveBeenCalledWith(7, 12);
    expect(mockedEmitArenaReactionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'arena.reaction.created',
        fromTenantId: 7,
        toTenantId: 12,
        reactionType: 'respect',
        counts: { tribute: 2, respect: 4, hype: 1 },
      })
    );
  });

  it('returns default progress summary when XP aggregation query fails', async () => {
    mockedDb.execute.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await getArenaProgressSummary(
      makeGetRequest('http://localhost/api/arena/progress-summary', { 'x-tenant-id': '7' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      totalXp: 0,
      level: 1,
      xpInLevel: 0,
      xpForNext: 100,
      levelPct: 0,
      totalTasksDone: 0,
      longestStreak: 0,
      streak: {
        current: 0,
        longest: 0,
        multiplier: 1,
        freezeCharges: 0,
      },
    });
  });

  it('returns active season details with progress metrics', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));

    mockedDb.select.mockReturnValueOnce(
      createSelectLimitBuilder([
        {
          id: 3,
          name: 'Operation Northstar',
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          endsAt: new Date('2026-01-31T00:00:00.000Z'),
        },
      ])
    );
    mockedDb.execute.mockResolvedValueOnce({ rows: [{ total: 420 }] });

    const res = await getArenaSeason(makeGetRequest('http://localhost/api/arena/season', { 'x-tenant-id': '7' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 3,
      name: 'Operation Northstar',
      days_remaining: 21,
      total_xp_earned: 420,
      season_pct: 30,
    });
  });

  it('returns 404 when no active season exists', async () => {
    mockedDb.select.mockReturnValueOnce(createSelectLimitBuilder([]));

    const res = await getArenaSeason(makeGetRequest('http://localhost/api/arena/season', { 'x-tenant-id': '7' }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'No active season' });
  });

  it('completes a gamification challenge and awards XP', async () => {
    mockedDb.select.mockReturnValueOnce(
      createSelectLimitBuilder([
        { id: 12, tenantId: 7, title: 'Ship release', xpReward: 120, status: 'active' },
      ])
    );
    mockedDb.update.mockReturnValueOnce(
      createUpdateReturningBuilder([
        { id: 12, tenantId: 7, title: 'Ship release', xpReward: 120, status: 'completed' },
      ])
    );

    const res = await postGamificationChallengeComplete(
      new NextRequest('http://localhost/api/gamification/challenges/12/complete', {
        method: 'POST',
        headers: new Headers({ 'x-tenant-id': '7' }),
      }),
      { params: Promise.resolve({ id: '12' }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 12, status: 'completed' });
    expect(mockedAwardXp).toHaveBeenCalledWith(7, 120, 'challenge_won', '12');
    expect(mockedEmitEvent).toHaveBeenCalledWith(
      7,
      'challenge_completed',
      expect.objectContaining({ challengeName: 'Ship release', challengeId: 12, xpReward: 120 })
    );
  });

  it('returns leaderboard rows with computed level values', async () => {
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        { id: 1, slug: 'alpha', totalXp: 250 },
        { id: 2, slug: 'beta', totalXp: 99 },
      ],
    });

    const res = await getGamificationLeaderboard();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { tenantId: 1, tenantSlug: 'alpha', totalXp: 250, level: 3 },
      { tenantId: 2, tenantSlug: 'beta', totalXp: 99, level: 1 },
    ]);
  });

  it('computes level-up state in gamification summary from tenant XP total', async () => {
    mockedDb.select
      .mockReturnValueOnce(createSelectWhereBuilder([{ totalXp: 250 }]))
      .mockReturnValueOnce(createSelectOrderByLimitBuilder([{ currentStreak: 6, longestStreak: 9 }]))
      .mockReturnValueOnce(createSelectWhereBuilder([{ count: 3 }]));
    mockedDb.execute.mockResolvedValueOnce({ rows: [{ rank: 2 }] });

    const res = await getGamificationSummary(
      makeGetRequest('http://localhost/api/gamification/summary', { 'x-tenant-id': '7' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      totalXp: 250,
      level: 3,
      currentStreak: 6,
      longestStreak: 9,
      rank: 2,
      activeChallenges: 3,
    });
  });
});
