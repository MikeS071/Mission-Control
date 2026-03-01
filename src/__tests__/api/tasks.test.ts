import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { GET as listTasks, POST as createTask, PATCH as updateTask, DELETE as deleteTask } from '@/app/api/tasks/route';
import { GET as getTaskById, PATCH as updateTaskById, DELETE as deleteTaskById } from '@/app/api/tasks/[id]/route';

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

jest.mock('@/lib/kanbanTrigger', () => ({
  fireKanbanTrigger: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;

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
    title: 'Ship test coverage',
    description: 'Add task route tests',
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
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function selectWhereDirect(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  return { from, where };
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

function deleteWhere(value: unknown = undefined) {
  const where = jest.fn().mockResolvedValue(value);
  return { where };
}

describe('task API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue(null);
  });

  it('returns 401 on create when user is unauthorized', async () => {
    const req = makeRequest('POST', 'http://localhost/api/tasks', {
      title: 'No session',
    });

    const res = await createTask(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('creates a task with normalized fields and emits creation event', async () => {
    const existingGoalRows = selectWhereDirect([{ goalId: 'G004' }]);
    const createdTask = makeTask({
      id: 8,
      title: 'Build test suite',
      status: 'done',
      priority: 'Critical',
      goalId: 'G005',
      checklist: '[]',
    });
    const taskInsert = insertReturning([createdTask]);
    const eventInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: existingGoalRows.from });
    mockedDb.insert
      .mockReturnValueOnce(taskInsert)
      .mockReturnValueOnce(eventInsert);

    const req = makeRequest(
      'POST',
      'http://localhost/api/tasks',
      {
        title: 'Build test suite',
        priority: 'critical',
        status: 'completed',
      },
      { 'x-tenant-id': '7' },
    );

    const res = await createTask(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ id: 8, status: 'done', priority: 'Critical' }));
    expect(taskInsert.values).toHaveBeenCalledWith(expect.objectContaining({ goalId: 'G005', status: 'done', priority: 'Critical' }));
    expect(eventInsert.values).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'task_created', taskId: 8 }));
  });

  it('lists tasks with query filters applied', async () => {
    const rows = [
      makeTask({ id: 1, status: 'done', priority: 'Critical', assignedAgent: 'Navi' }),
      makeTask({ id: 2, status: 'backlog', priority: 'Low', assignedAgent: 'Kai' }),
      makeTask({ id: 3, status: 'done', priority: 'Critical', assignedAgent: 'Ada' }),
    ];
    const selectBuilder = selectWhereOrderBy(rows);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const req = makeRequest(
      'GET',
      'http://localhost/api/tasks?status=done&priority=critical&assignedAgent=Navi',
      undefined,
      { 'x-tenant-id': '7' },
    );

    const res = await listTasks(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual(expect.objectContaining({ id: 1, status: 'done', assignedAgent: 'Navi' }));
  });

  it('updates a task status and records status transition event', async () => {
    const before = makeTask({ id: 4, status: 'backlog' });
    const after = makeTask({ id: 4, status: 'done' });
    const selectBuilder = selectWhereLimit([before]);
    const updateBuilder = updateReturning([after]);
    const eventInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);
    mockedDb.insert.mockReturnValueOnce(eventInsert);

    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks',
      { id: 4, status: 'completed' },
      { 'x-tenant-id': '7' },
    );

    const res = await updateTask(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ id: 4, status: 'done' }));
    expect(eventInsert.values).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'task_status_changed', taskId: 4 }));
  });

  it('assigns a user to a task via patch', async () => {
    const before = makeTask({ id: 5, assignedAgent: null });
    const after = makeTask({ id: 5, assignedAgent: 'Navi' });
    const selectBuilder = selectWhereLimit([before]);
    const updateBuilder = updateReturning([after]);

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks',
      { id: 5, assignedAgent: 'Navi' },
      { 'x-tenant-id': '7' },
    );

    const res = await updateTask(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ id: 5, assignedAgent: 'Navi' }));
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ assignedAgent: 'Navi' }));
  });

  it('adds a comment to a task and records a comment event', async () => {
    const before = makeTask({ id: 6, status: 'in_progress' });
    const after = makeTask({ id: 6, status: 'in_progress' });
    const selectBuilder = selectWhereLimit([before]);
    const updateBuilder = updateReturning([after]);
    const commentInsert = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);
    mockedDb.insert.mockReturnValueOnce(commentInsert);

    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks',
      { id: 6, comment: 'Please validate edge cases.' },
      { 'x-tenant-id': '7' },
    );

    const res = await updateTask(req);
    await res.json();

    expect(res.status).toBe(200);
    expect(commentInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'task_comment_added',
        taskId: 6,
      }),
    );
  });

  it('deletes a task by id and returns ok', async () => {
    const existingTask = makeTask({ id: 9 });
    const selectBuilder = selectWhereLimit([existingTask]);
    const eventInsert = insertValues();
    const deleteBuilder = deleteWhere();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.insert.mockReturnValueOnce(eventInsert);
    mockedDb.delete.mockReturnValueOnce(deleteBuilder);

    const req = makeRequest(
      'DELETE',
      'http://localhost/api/tasks',
      { id: 9 },
      { 'x-tenant-id': '7' },
    );

    const res = await deleteTask(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(deleteBuilder.where).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when delete body has invalid task id', async () => {
    const req = makeRequest(
      'DELETE',
      'http://localhost/api/tasks',
      { id: 0 },
      { 'x-tenant-id': '7' },
    );

    const res = await deleteTask(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('positive integer');
  });

  it('returns 401 for GET /tasks/[id] when unauthorized', async () => {
    const req = makeRequest('GET', 'http://localhost/api/tasks/4');
    const res = await getTaskById(req, { params: Promise.resolve({ id: '4' }) });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for PATCH /tasks/[id] when task id is invalid', async () => {
    const req = makeRequest(
      'PATCH',
      'http://localhost/api/tasks/not-a-number',
      { title: 'rename' },
      { 'x-tenant-id': '7' },
    );

    const res = await updateTaskById(req, { params: Promise.resolve({ id: 'not-a-number' }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid task id' });
  });

  it('returns 404 for DELETE /tasks/[id] when task does not exist', async () => {
    const selectBuilder = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const req = makeRequest(
      'DELETE',
      'http://localhost/api/tasks/999',
      undefined,
      { 'x-tenant-id': '7' },
    );

    const res = await deleteTaskById(req, { params: Promise.resolve({ id: '999' }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Task not found' });
  });
});
