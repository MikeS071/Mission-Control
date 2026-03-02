import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { awardXp } from '@/lib/xp';
import { emitEvent } from '@/lib/activity';
import { GET as getChallenges } from '@/app/api/gamification/challenges/route';
import { POST as completeChallenge } from '@/app/api/gamification/challenges/[id]/complete/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
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

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAwardXp = awardXp as unknown as jest.Mock;
const mockedEmitEvent = emitEvent as unknown as jest.Mock;

function makeGetRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'GET', headers: new Headers(headers) });
}

function makePostRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'POST', headers: new Headers(headers) });
}

function createSelectOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy };
}

function createSelectLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function createUpdateReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning };
}

describe('gamification challenge API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET challenges list returns tenant challenges', async () => {
    const rows = [
      { id: 9, tenantId: 7, title: 'Daily standup', status: 'active', xpReward: 30 },
      { id: 6, tenantId: 7, title: 'Ship sprint', status: 'completed', xpReward: 120 },
    ];
    mockedDb.select.mockReturnValueOnce(createSelectOrderByBuilder(rows));

    const res = await getChallenges(makeGetRequest('http://localhost/api/gamification/challenges', { 'x-tenant-id': '7' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(rows);
    expect(mockedDb.select).toHaveBeenCalledTimes(1);
  });

  it('GET challenges returns unauthorized when tenant context is missing', async () => {
    const res = await getChallenges(makeGetRequest('http://localhost/api/gamification/challenges'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('GET challenges returns empty list when no records exist', async () => {
    mockedDb.select.mockReturnValueOnce(createSelectOrderByBuilder([]));

    const res = await getChallenges(makeGetRequest('http://localhost/api/gamification/challenges', { 'x-tenant-id': '7' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it('POST complete challenge marks challenge complete and awards XP', async () => {
    mockedDb.select.mockReturnValueOnce(
      createSelectLimitBuilder([{ id: 12, tenantId: 7, title: 'Release v1', xpReward: 120, status: 'active' }]),
    );
    mockedDb.update.mockReturnValueOnce(
      createUpdateReturningBuilder([{ id: 12, tenantId: 7, title: 'Release v1', xpReward: 120, status: 'completed' }]),
    );

    const res = await completeChallenge(
      makePostRequest('http://localhost/api/gamification/challenges/12/complete', { 'x-tenant-id': '7' }),
      { params: Promise.resolve({ id: '12' }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 12, status: 'completed' });
    expect(mockedAwardXp).toHaveBeenCalledWith(7, 120, 'challenge_won', '12');
    expect(mockedEmitEvent).toHaveBeenCalledWith(
      7,
      'challenge_completed',
      expect.objectContaining({ challengeName: 'Release v1', challengeId: 12, xpReward: 120 }),
    );
  });

  it('POST complete challenge returns 400 for invalid challenge ID', async () => {
    const res = await completeChallenge(
      makePostRequest('http://localhost/api/gamification/challenges/bad/complete', { 'x-tenant-id': '7' }),
      { params: Promise.resolve({ id: 'bad' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid id' });
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(mockedAwardXp).not.toHaveBeenCalled();
    expect(mockedEmitEvent).not.toHaveBeenCalled();
  });

  it('POST complete challenge returns existing row when already completed', async () => {
    const completed = { id: 22, tenantId: 7, title: 'Finalize docs', xpReward: 80, status: 'completed' };
    mockedDb.select.mockReturnValueOnce(createSelectLimitBuilder([completed]));

    const res = await completeChallenge(
      makePostRequest('http://localhost/api/gamification/challenges/22/complete', { 'x-tenant-id': '7' }),
      { params: Promise.resolve({ id: '22' }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(completed);
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(mockedAwardXp).not.toHaveBeenCalled();
    expect(mockedEmitEvent).not.toHaveBeenCalled();
  });
});
