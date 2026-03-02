import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';
import { generatePrdMarkdown, updatePrdMarkdown } from '@/lib/prd-ai';
import {
  buildCanonicalPrdPath,
  buildVersionedPrdPath,
  ensurePrdDir,
  isVersionedPrdPath,
  movedToStub,
  readWorkspaceMarkdown,
  writeWorkspaceMarkdown,
} from '@/lib/prd-files';
import { postAssistantMessage } from '@/lib/chat-system';
import { GET as getPrdRoute } from '@/app/api/tasks/[id]/prd/route';
import { POST as generatePrdRoute } from '@/app/api/tasks/[id]/prd/generate/route';
import { POST as newPrdVersionRoute } from '@/app/api/tasks/[id]/prd/new-version/route';
import { POST as updatePrdRoute } from '@/app/api/tasks/[id]/prd/update/route';
import { GET as listPrdVersionsRoute } from '@/app/api/tasks/[id]/prd/versions/route';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  getTenantId: jest.fn(),
}));

jest.mock('@/lib/prd-ai', () => ({
  generatePrdMarkdown: jest.fn(),
  updatePrdMarkdown: jest.fn(),
}));

jest.mock('@/lib/prd-files', () => ({
  readWorkspaceMarkdown: jest.fn(),
  writeWorkspaceMarkdown: jest.fn(),
  ensurePrdDir: jest.fn(),
  buildCanonicalPrdPath: jest.fn(),
  buildVersionedPrdPath: jest.fn(),
  movedToStub: jest.fn(),
  isVersionedPrdPath: jest.fn(),
}));

jest.mock('@/lib/chat-system', () => ({
  postAssistantMessage: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type RouteHandler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const mockedDb = db as unknown as MockDb;
const mockedGetTenantId = getTenantId as unknown as jest.Mock;
const mockedGeneratePrdMarkdown = generatePrdMarkdown as unknown as jest.Mock;
const mockedUpdatePrdMarkdown = updatePrdMarkdown as unknown as jest.Mock;
const mockedReadWorkspaceMarkdown = readWorkspaceMarkdown as unknown as jest.Mock;
const mockedWriteWorkspaceMarkdown = writeWorkspaceMarkdown as unknown as jest.Mock;
const mockedEnsurePrdDir = ensurePrdDir as unknown as jest.Mock;
const mockedBuildCanonicalPrdPath = buildCanonicalPrdPath as unknown as jest.Mock;
const mockedBuildVersionedPrdPath = buildVersionedPrdPath as unknown as jest.Mock;
const mockedMovedToStub = movedToStub as unknown as jest.Mock;
const mockedIsVersionedPrdPath = isVersionedPrdPath as unknown as jest.Mock;
const mockedPostAssistantMessage = postAssistantMessage as unknown as jest.Mock;

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

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 7,
    title: 'Improve PRD coverage',
    description: 'Write route-level tests',
    prdPath: '/prds/task-1.md',
    prdCanonicalPath: '/prds/task-1.md',
    prdVersion: 1,
    prdLastUpdatedAt: null,
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
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

function updateWhere(value: unknown = undefined) {
  const where = jest.fn().mockResolvedValue(value);
  const set = jest.fn().mockReturnValue({ where });
  return { set, where };
}

function insertValues(value: unknown = undefined) {
  const values = jest.fn().mockResolvedValue(value);
  return { values };
}

describe('PRD API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTenantId.mockReturnValue(7);
    mockedGeneratePrdMarkdown.mockResolvedValue({ markdown: '# Generated PRD' });
    mockedUpdatePrdMarkdown.mockResolvedValue({ markdown: '# Updated PRD' });
    mockedReadWorkspaceMarkdown.mockReturnValue('# Existing PRD');
    mockedBuildCanonicalPrdPath.mockReturnValue('/prds/task-1.md');
    mockedBuildVersionedPrdPath.mockImplementation((_taskId: number, _title: string, version: number) => {
      return `/prds/task-1.v${version}.md`;
    });
    mockedMovedToStub.mockImplementation((path: string) => `Moved to ${path}`);
    mockedIsVersionedPrdPath.mockReturnValue(false);
    mockedPostAssistantMessage.mockResolvedValue(undefined);
  });

  it('gets PRD content for a task', async () => {
    const task = makeTask();
    const selectBuilder = selectWhereLimit([task]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedReadWorkspaceMarkdown.mockReturnValueOnce('# Product Requirements');

    const req = makeRequest('GET', 'http://localhost/api/tasks/1/prd');
    const res = await getPrdRoute(req, makeContext('1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      prdPath: '/prds/task-1.md',
      prdCanonicalPath: '/prds/task-1.md',
      prdVersion: 1,
      content: '# Product Requirements',
    });
    expect(mockedReadWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.md');
  });

  it('generates a PRD and stores version 1', async () => {
    const task = makeTask({ prdPath: null, prdCanonicalPath: null, prdVersion: null });
    const selectBuilder = selectWhereLimit([task]);
    const updateBuilder = updateWhere();
    const insertBuilder = insertValues();
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateBuilder);
    mockedDb.insert.mockReturnValueOnce(insertBuilder);
    mockedGeneratePrdMarkdown.mockResolvedValueOnce({ markdown: '## Draft PRD' });

    const req = makeRequest('POST', 'http://localhost/api/tasks/1/prd/generate');
    const res = await generatePrdRoute(req, makeContext('1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      prdPath: '/prds/task-1.md',
      prdCanonicalPath: '/prds/task-1.md',
      prdVersion: 1,
    });
    expect(mockedGeneratePrdMarkdown).toHaveBeenCalledWith({
      title: 'Improve PRD coverage',
      description: 'Write route-level tests',
    });
    expect(mockedEnsurePrdDir).toHaveBeenCalled();
    expect(mockedWriteWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.md', '## Draft PRD\n');
    expect(updateBuilder.set).toHaveBeenCalledWith(expect.objectContaining({ prdPath: '/prds/task-1.md', prdVersion: 1 }));
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 1,
        versionNumber: 1,
        source: 'generate',
        isCurrent: true,
      }),
    );
  });

  it('creates a new PRD version and updates current pointer', async () => {
    const task = makeTask({
      prdPath: '/prds/task-1.md',
      prdCanonicalPath: '/prds/task-1.md',
      prdVersion: 1,
    });
    const selectBuilder = selectWhereLimit([task]);
    const unsetCurrentUpdate = updateWhere();
    const updateV1Path = updateWhere();
    const updateTask = updateWhere();
    const insertBuilder = insertValues();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update
      .mockReturnValueOnce(unsetCurrentUpdate)
      .mockReturnValueOnce(updateV1Path)
      .mockReturnValueOnce(updateTask);
    mockedDb.insert.mockReturnValueOnce(insertBuilder);
    mockedReadWorkspaceMarkdown.mockReturnValueOnce('# Current V1');
    mockedUpdatePrdMarkdown.mockResolvedValueOnce({ markdown: '# Next V2' });

    const req = makeRequest('POST', 'http://localhost/api/tasks/1/prd/new-version');
    const res = await newPrdVersionRoute(req, makeContext('1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      prdPath: '/prds/task-1.v2.md',
      prdCanonicalPath: '/prds/task-1.md',
      prdVersion: 2,
    });
    expect(mockedWriteWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.v1.md', '# Current V1');
    expect(mockedWriteWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.md', 'Moved to /prds/task-1.v2.md');
    expect(mockedWriteWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.v2.md', '# Next V2\n');
    expect(mockedDb.update).toHaveBeenCalledTimes(3);
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 1,
        versionNumber: 2,
        source: 'new_version',
        isCurrent: true,
      }),
    );
  });

  it('updates the existing PRD in-place', async () => {
    const task = makeTask({ prdVersion: 3 });
    const selectBuilder = selectWhereLimit([task]);
    const updateTask = updateWhere();

    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });
    mockedDb.update.mockReturnValueOnce(updateTask);
    mockedReadWorkspaceMarkdown.mockReturnValueOnce('# Existing');
    mockedUpdatePrdMarkdown.mockResolvedValueOnce({ markdown: '# Refined' });
    mockedIsVersionedPrdPath.mockReturnValueOnce(false);

    const req = makeRequest('POST', 'http://localhost/api/tasks/1/prd/update');
    const res = await updatePrdRoute(req, makeContext('1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      prdPath: '/prds/task-1.md',
      prdCanonicalPath: '/prds/task-1.md',
      prdVersion: 3,
    });
    expect(mockedWriteWorkspaceMarkdown).toHaveBeenCalledWith('/prds/task-1.md', '# Refined\n');
    expect(updateTask.set).toHaveBeenCalledWith(expect.objectContaining({ prdPath: '/prds/task-1.md' }));
  });

  it('lists PRD versions for a task', async () => {
    const taskSelect = selectWhereLimit([{ id: 1 }]);
    const versions = [
      {
        id: 12,
        versionNumber: 1,
        path: '/prds/task-1.v1.md',
        source: 'generate',
        isCurrent: false,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        createdBy: 'system',
        changeNote: null,
      },
      {
        id: 13,
        versionNumber: 2,
        path: '/prds/task-1.v2.md',
        source: 'new_version',
        isCurrent: true,
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        createdBy: 'system',
        changeNote: 'Expanded scope',
      },
    ];
    const versionsSelect = selectWhereOrderBy(versions);
    mockedDb.select
      .mockReturnValueOnce({ from: taskSelect.from })
      .mockReturnValueOnce({ from: versionsSelect.from });

    const req = makeRequest('GET', 'http://localhost/api/tasks/1/prd/versions');
    const res = await listPrdVersionsRoute(req, makeContext('1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      versions: versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString(),
      })),
    });
    expect(versionsSelect.orderBy).toHaveBeenCalled();
  });

  it.each([
    ['GET /prd', getPrdRoute, 'GET', 'http://localhost/api/tasks/999/prd'],
    ['POST /prd/generate', generatePrdRoute, 'POST', 'http://localhost/api/tasks/999/prd/generate'],
    ['POST /prd/new-version', newPrdVersionRoute, 'POST', 'http://localhost/api/tasks/999/prd/new-version'],
    ['POST /prd/update', updatePrdRoute, 'POST', 'http://localhost/api/tasks/999/prd/update'],
    ['GET /prd/versions', listPrdVersionsRoute, 'GET', 'http://localhost/api/tasks/999/prd/versions'],
  ])('%s returns 404 when task id does not exist', async (_label, handler: RouteHandler, method, url) => {
    const selectBuilder = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

    const req = makeRequest(method, url);
    const res = await handler(req, makeContext('999'));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Task not found' });
  });
});
