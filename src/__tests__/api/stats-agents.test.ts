import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/policy', () => ({
  getOrCreatePolicy: jest.fn(),
  checkLimit: jest.fn(),
}));

import { GET as getStatsSummary } from '@/app/api/stats/summary/route';
import { GET as getAgentStats, POST as postAgentStats } from '@/app/api/agent-stats/route';
import { GET as getActiveAgents } from '@/app/api/agents/active/route';
import { checkLimit, getOrCreatePolicy } from '@/lib/policy';

type MockDb = {
  execute: jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedGetOrCreatePolicy = getOrCreatePolicy as jest.MockedFunction<typeof getOrCreatePolicy>;
const mockedCheckLimit = checkLimit as jest.MockedFunction<typeof checkLimit>;

function makeRequest(
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
): NextRequest {
  const headers = new Headers();
  if (body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

describe('stats + agents API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockedResolveTenantId.mockResolvedValue(7);
    mockedDb.execute.mockResolvedValue({ rows: [] });
    mockedGetOrCreatePolicy.mockResolvedValue({
      tier: 'free',
      limits: { api_calls_per_day: 100, agents: 1 },
      features: { models: true },
    });
    mockedCheckLimit.mockReturnValue({
      allowed: true,
      key: 'agents',
      current: 0,
      limit: 1,
      remaining: 1,
    });
  });

  describe('GET /api/stats/summary', () => {
    it('returns computed summary values', async () => {
      mockedDb.execute
        .mockResolvedValueOnce({ rows: [{ total_tasks: 10, done_tasks: 4 }] })
        .mockResolvedValueOnce({ rows: [{ active_agents: 3 }] })
        .mockResolvedValueOnce({ rows: [{ total_cost_usd: '12.5000' }] })
        .mockResolvedValueOnce({ rows: [{ tasks_done_today: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total_tokens: '1500' }] })
        .mockResolvedValueOnce({ rows: [{ tasks_this_week: 6 }] })
        .mockResolvedValueOnce({ rows: [{ current_streak: 4 }] });

      const settingsSelect = createSelectWhereLimitBuilder([
        {
          settings: {
            savingsRatePct: 20,
            tokenLimitMonthly: 2000,
            primaryAgentName: 'atlas',
          },
        },
      ]);
      mockedDb.select.mockReturnValueOnce({ from: settingsSelect.from });

      const res = await getStatsSummary(makeRequest('GET', 'http://localhost/api/stats/summary'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        pctComplete: 40,
        activeAgents: 3,
        totalCostUsd: '12.5000',
        savedUsd: '3.1250',
        savingsRatePct: 20,
        tasksDoneToday: 2,
        totalTasks: 10,
        doneTasks: 4,
        totalTokens: 1500,
        tokenLimitMonthly: 2000,
        tokenPctOfLimit: 75,
        primaryAgentName: 'atlas',
        tasksThisWeek: 6,
        currentStreak: 4,
      });
      expect(mockedDb.execute).toHaveBeenCalledTimes(7);
      expect(settingsSelect.where).toHaveBeenCalled();
      expect(settingsSelect.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('GET/POST /api/agent-stats', () => {
    it('GET returns latest stats rows', async () => {
      const rows = [
        {
          id: 1,
          agentName: 'atlas',
          tokens: 200,
          costUsd: '1.5000',
          recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      mockedDb.execute.mockResolvedValueOnce({ rows });

      const res = await getAgentStats(makeRequest('GET', 'http://localhost/api/agent-stats'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([
        {
          ...rows[0],
          recordedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(mockedDb.execute).toHaveBeenCalledTimes(1);
    });

    it('POST creates a row with trimmed name and defaults', async () => {
      const created = {
        id: 3,
        tenantId: 7,
        agentName: 'atlas',
        tokens: 0,
        costUsd: '0.00',
      };
      const insertBuilder = createInsertReturningBuilder([created]);
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await postAgentStats(
        makeRequest('POST', 'http://localhost/api/agent-stats', {
          agentName: '  atlas  ',
        }),
      );

      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual(created);
      expect(insertBuilder.values).toHaveBeenCalledWith({
        tenantId: 7,
        agentName: 'atlas',
        tokens: 0,
        costUsd: '0.00',
      });
    });

    it('POST returns 400 for invalid payload', async () => {
      const res = await postAgentStats(
        makeRequest('POST', 'http://localhost/api/agent-stats', {
          tokens: -1,
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(typeof json.error).toBe('string');
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST returns 403 with upgrade prompt when agent limit is reached', async () => {
      mockedDb.execute.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      mockedCheckLimit.mockReturnValueOnce({
        allowed: false,
        key: 'agents',
        current: 1,
        limit: 1,
        remaining: 0,
        reason: 'Agent limit reached for current plan',
        upgradeRequired: true,
      });

      const res = await postAgentStats(
        makeRequest('POST', 'http://localhost/api/agent-stats', {
          agentName: 'new-agent',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json).toEqual(
        expect.objectContaining({
          error: expect.stringMatching(/agent limit/i),
          upgradePrompt: expect.any(String),
        }),
      );
      expect(mockedCheckLimit).toHaveBeenCalledWith(expect.any(Object), 'agents', expect.any(Number));
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/agents/active', () => {
    it('returns active agents with computed statuses', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
      mockedDb.execute.mockResolvedValueOnce({
        rows: [
          {
            agentName: 'atlas',
            tokens: 100,
            costUsd: '1.0000',
            lastSeenAt: new Date('2026-01-01T11:58:00.000Z'),
          },
          {
            agentName: 'hermes',
            tokens: 80,
            costUsd: '0.8000',
            lastSeenAt: new Date('2026-01-01T11:30:00.000Z'),
          },
          {
            agentName: 'hephaestus',
            tokens: 60,
            costUsd: '0.6000',
            lastSeenAt: new Date('2026-01-01T09:00:00.000Z'),
          },
        ],
      });

      const res = await getActiveAgents(makeRequest('GET', 'http://localhost/api/agents/active'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([
        {
          agentName: 'atlas',
          tokens: 100,
          costUsd: '1.0000',
          lastSeenAt: '2026-01-01T11:58:00.000Z',
          status: 'working',
        },
        {
          agentName: 'hermes',
          tokens: 80,
          costUsd: '0.8000',
          lastSeenAt: '2026-01-01T11:30:00.000Z',
          status: 'idle',
        },
        {
          agentName: 'hephaestus',
          tokens: 60,
          costUsd: '0.6000',
          lastSeenAt: '2026-01-01T09:00:00.000Z',
          status: 'inactive',
        },
      ]);
    });
  });

  describe('missing tenant context', () => {
    it('returns 401 and avoids DB for all routes', async () => {
      mockedResolveTenantId.mockResolvedValue(null);

      const summaryRes = await getStatsSummary(makeRequest('GET', 'http://localhost/api/stats/summary'));
      const agentGetRes = await getAgentStats(makeRequest('GET', 'http://localhost/api/agent-stats'));
      const agentPostRes = await postAgentStats(
        makeRequest('POST', 'http://localhost/api/agent-stats', { agentName: 'atlas' }),
      );
      const activeRes = await getActiveAgents(makeRequest('GET', 'http://localhost/api/agents/active'));

      expect(summaryRes.status).toBe(401);
      await expect(summaryRes.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(agentGetRes.status).toBe(401);
      await expect(agentGetRes.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(agentPostRes.status).toBe(401);
      await expect(agentPostRes.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(activeRes.status).toBe(401);
      await expect(activeRes.json()).resolves.toEqual({ error: 'Unauthorized' });

      expect(mockedDb.execute).not.toHaveBeenCalled();
      expect(mockedDb.select).not.toHaveBeenCalled();
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });
  });
});
