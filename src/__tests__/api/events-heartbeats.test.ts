import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

import { GET as getEvents, POST as postEvents } from '@/app/api/events/route';
import { GET as getHeartbeats } from '@/app/api/heartbeats/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;

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

function createEventsSelectBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const leftJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ leftJoin });
  return { from, leftJoin, where, orderBy, limit };
}

function createInsertReturningBuilder(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

describe('events + heartbeats API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
  });

  describe('events route', () => {
    it('GET returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await getEvents(makeRequest('GET', 'http://localhost/api/events'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns rows for tenant with task filter and clamps limit to 100', async () => {
      const rows = [
        {
          id: 11,
          taskId: 42,
          agentName: 'navi',
          eventType: 'task_updated',
          payload: '{}',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          taskTitle: 'Ship routing',
        },
      ];
      const selectBuilder = createEventsSelectBuilder(rows);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await getEvents(makeRequest('GET', 'http://localhost/api/events?taskId=42&limit=500'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(selectBuilder.leftJoin).toHaveBeenCalled();
      expect(selectBuilder.where).toHaveBeenCalled();
      expect(selectBuilder.orderBy).toHaveBeenCalled();
      expect(selectBuilder.limit).toHaveBeenCalledWith(100);
      expect(json).toEqual([
        {
          ...rows[0],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('GET uses default limit 50 when limit is invalid', async () => {
      const selectBuilder = createEventsSelectBuilder([]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await getEvents(makeRequest('GET', 'http://localhost/api/events?limit=invalid'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([]);
      expect(selectBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('POST returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await postEvents(
        makeRequest('POST', 'http://localhost/api/events', {
          eventType: 'heartbeat',
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST returns 400 for invalid payload', async () => {
      const res = await postEvents(
        makeRequest('POST', 'http://localhost/api/events', {
          eventType: '',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('eventType');
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST inserts event with defaults and returns 201', async () => {
      const created = {
        id: 19,
        tenantId: 7,
        taskId: null,
        agentName: 'system',
        eventType: 'task_created',
        payload: '',
      };
      const insertBuilder = createInsertReturningBuilder([created]);
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await postEvents(
        makeRequest('POST', 'http://localhost/api/events', {
          eventType: 'task_created',
        }),
      );

      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual(created);
      expect(insertBuilder.values).toHaveBeenCalledWith({
        tenantId: 7,
        taskId: null,
        agentName: 'system',
        eventType: 'task_created',
        payload: '',
      });
    });
  });

  describe('heartbeats route', () => {
    it('GET returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await getHeartbeats(makeRequest('GET', 'http://localhost/api/heartbeats'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });

    it('GET returns latest heartbeat rows', async () => {
      const rows = [
        {
          id: 3,
          source: 'runner-1',
          status: 'ok',
          payload: '{"alive":true}',
          checkedAt: new Date('2026-01-02T03:04:05.000Z'),
        },
      ];
      mockedDb.execute.mockResolvedValueOnce({ rows });

      const res = await getHeartbeats(makeRequest('GET', 'http://localhost/api/heartbeats'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(mockedDb.execute).toHaveBeenCalledTimes(1);
      expect(json).toEqual([
        {
          ...rows[0],
          checkedAt: '2026-01-02T03:04:05.000Z',
        },
      ]);
    });

    it('GET returns empty array when there are no heartbeat rows', async () => {
      mockedDb.execute.mockResolvedValueOnce({ rows: [] });

      const res = await getHeartbeats(makeRequest('GET', 'http://localhost/api/heartbeats'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([]);
    });
  });
});
