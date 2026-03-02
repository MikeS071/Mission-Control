import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { resolveTenantId, getTenantId } from '@/lib/tenant';
import { emitTaskEvent } from '@/lib/kanbanTrigger';
import { GET as listTaskEvents, POST as createTaskEvent } from '@/app/api/tasks/events/route';
import { POST as createTask, PATCH as patchTask } from '@/app/api/tasks/route';
import { PATCH as patchTaskById } from '@/app/api/tasks/[id]/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
  getTenantId: jest.fn(),
}));

jest.mock('@/lib/checklist-ai', () => ({
  generateChecklistItems: jest.fn().mockResolvedValue([]),
  parseChecklist: jest.fn((raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }),
  stringifyChecklist: jest.fn((items: Array<{ id: string; text: string; checked: boolean }>) => JSON.stringify(items)),
}));

jest.mock('@/lib/telegram', () => ({
  sendTelegramMessage: jest.fn(),
}));

jest.mock('@/lib/xp', () => ({
  awardXp: jest.fn(),
  XP_RULES: {
    TASK_CREATED: 5,
    TASK_COMPLETED: 10,
  },
}));

jest.mock('@/lib/activity', () => ({
  emitEvent: jest.fn(),
}));

jest.mock('@/lib/kanbanTrigger', () => ({
  emitTaskEvent: jest.fn(),
  fireKanbanTrigger: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
const mockedEmitTaskEvent = emitTaskEvent as jest.MockedFunction<typeof emitTaskEvent>;

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 7,
    title: 'Task title',
    description: 'Task description',
    status: 'backlog',
    priority: 'Medium',
    goal: 'Goal 1',
    goalId: 'G001',
    assignedAgent: null,
    tags: '',
    checklist: '[]',
    prdPath: null,
    prdCanonicalPath: null,
    prdVersion: 1,
    prdLastUpdatedAt: null,
    prdMissingRemindedAt: null,
    completedAt: null,
    estimatedCostUsd: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function selectWhereOrderByLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function selectWhereDirect(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  return { from, where };
}

function insertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  return { values, returning };
}

function insertValues(value: unknown = undefined) {
  const values = jest.fn().mockResolvedValue(value);
  return { values };
}

function updateReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning };
}

describe('kanban task event triggers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
    mockedGetTenantId.mockReturnValue(7);
    mockedAuth.mockResolvedValue({ user: { email: 'admin@example.com', id: '11', isAdmin: true }, tenantId: 1 } as never);
  });

  it('GET /api/tasks/events returns recent tenant events and applies type filter', async () => {
    const rows = [
      {
        id: 10,
        tenantId: 7,
        taskId: 4,
        eventType: 'task_moved',
        payload: JSON.stringify({
          userId: 11,
          metadata: { from: 'backlog', to: 'in_progress' },
        }),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const selectBuilder = selectWhereOrderByLimit(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const req = makeRequest('GET', 'http://localhost/api/tasks/events?type=moved', undefined, {
      'x-tenant-id': '7',
    });

    const res = await listTaskEvents(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([{
      id: 10,
      tenantId: 7,
      taskId: 4,
      event: 'moved',
      userId: 11,
      metadata: { from: 'backlog', to: 'in_progress' },
      timestamp: '2026-01-01T00:00:00.000Z',
    }]);
    expect(selectBuilder.where).toHaveBeenCalledTimes(1);
    expect(selectBuilder.limit).toHaveBeenCalledWith(50);
  });

  it('GET /api/tasks/events returns 401 when tenant is missing', async () => {
    mockedResolveTenantId.mockResolvedValueOnce(null);

    const req = makeRequest('GET', 'http://localhost/api/tasks/events');
    const res = await listTaskEvents(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('POST /api/tasks/events returns 403 for non-admin callers', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'member@example.com', isAdmin: false }, tenantId: 7 } as never);

    const req = makeRequest(
      'POST',
      'http://localhost/api/tasks/events',
      { taskId: '4', event: 'created' },
      { 'x-tenant-id': '7' },
    );

    const res = await createTaskEvent(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedEmitTaskEvent).not.toHaveBeenCalled();
  });

  it('POST /api/tasks/events creates a manual event for admins', async () => {
    mockedEmitTaskEvent.mockResolvedValueOnce();

    const req = makeRequest(
      'POST',
      'http://localhost/api/tasks/events',
      {
        taskId: '4',
        event: 'overdue',
        metadata: { reason: 'deadline_missed' },
      },
      { 'x-tenant-id': '7' },
    );

    const res = await createTaskEvent(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ ok: true });
    expect(mockedEmitTaskEvent).toHaveBeenCalledWith('4', 'overdue', expect.objectContaining({ tenantId: 7, userId: 11 }));
  });

  it('POST /api/tasks emits created event on task creation', async () => {
    const goalRows = selectWhereDirect([{ goalId: 'G001' }]);
    const createdTask = makeTask({ id: 4, status: 'backlog' });
    const taskInsert = insertReturning([createdTask]);
    const eventInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: goalRows.from });
    mockedDb.insert
      .mockReturnValueOnce(taskInsert)
      .mockReturnValueOnce(eventInsert);

    const req = makeRequest(
      'POST',
      'http://localhost/api/tasks',
      { title: 'Ship kanban trigger' },
      { 'x-tenant-id': '7', 'x-user-id': '22' },
    );

    const res = await createTask(req);

    expect(res.status).toBe(200);
    expect(mockedEmitTaskEvent).toHaveBeenCalledWith(
      '4',
      'created',
      expect.objectContaining({ tenantId: 7, userId: 22 }),
    );
  });

  it('PATCH /api/tasks emits moved + completed when task becomes done', async () => {
    const before = makeTask({ id: 8, status: 'in_progress' });
    const after = makeTask({ id: 8, status: 'done' });
    const selectBuilder = selectWhereLimit([before]);
    const updateBuilder = updateReturning([after]);
    const eventInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);
    mockedDb.insert.mockReturnValueOnce(eventInsert);

    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks',
      { id: 8, status: 'done' },
      { 'x-tenant-id': '7', 'x-user-id': '44' },
    );

    const res = await patchTask(req);

    expect(res.status).toBe(200);
    expect(mockedEmitTaskEvent).toHaveBeenCalledWith(
      '8',
      'moved',
      expect.objectContaining({ tenantId: 7, userId: 44, fromStatus: 'in_progress', toStatus: 'done' }),
    );
    expect(mockedEmitTaskEvent).toHaveBeenCalledWith(
      '8',
      'completed',
      expect.objectContaining({ tenantId: 7, userId: 44 }),
    );
  });

  it('PATCH /api/tasks/[id] emits moved when status changes', async () => {
    const before = makeTask({ id: 6, status: 'backlog' });
    const after = makeTask({ id: 6, status: 'in_progress' });
    const selectBuilder = selectWhereLimit([before]);
    const updateBuilder = updateReturning([after]);
    const eventInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);
    mockedDb.insert.mockReturnValueOnce(eventInsert);

    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks/6',
      { status: 'in_progress' },
      { 'x-tenant-id': '7', 'x-user-id': '55' },
    );

    const res = await patchTaskById(req, { params: Promise.resolve({ id: '6' }) });

    expect(res.status).toBe(200);
    expect(mockedEmitTaskEvent).toHaveBeenCalledWith(
      '6',
      'moved',
      expect.objectContaining({ tenantId: 7, userId: 55, fromStatus: 'backlog', toStatus: 'in_progress' }),
    );
  });
});
