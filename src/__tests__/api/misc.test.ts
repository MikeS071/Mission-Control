import { createHmac } from 'crypto';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { execSync } from 'node:child_process';
import pkg from '../../../package.json';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { encrypt, tryDecrypt } from '@/lib/crypto';
import { aipipeSyncTenantKeys } from '@/lib/aipipe';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('fs', () => {
  const fsMock = {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    readdirSync: jest.fn(),
  };

  return {
    __esModule: true,
    default: fsMock,
    ...fsMock,
  };
});

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `enc:${value}`),
  tryDecrypt: jest.fn((value: string) => (value.startsWith('enc:') ? value.slice(4) : value)),
}));

jest.mock('@/lib/aipipe', () => ({
  aipipeSyncTenantKeys: jest.fn().mockResolvedValue(undefined),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  execute: jest.Mock;
};

type MockFs = {
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
  unlinkSync: jest.Mock;
  readdirSync: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.Mock;
const mockedFs = fs as unknown as MockFs;
const mockedExecSync = execSync as unknown as jest.Mock;
const mockedEncrypt = encrypt as unknown as jest.MockedFunction<typeof encrypt>;
const mockedTryDecrypt = tryDecrypt as unknown as jest.MockedFunction<typeof tryDecrypt>;
const mockedAipipeSyncTenantKeys = aipipeSyncTenantKeys as unknown as jest.MockedFunction<typeof aipipeSyncTenantKeys>;

let metaHealthGet: typeof import('@/app/api/meta/health/route').GET;
let metaVersionGet: typeof import('@/app/api/meta/version/route').GET;
let metaDiagGet: typeof import('@/app/api/meta/diag/route').GET;

let workspaceFileGet: typeof import('@/app/api/workspace/file/route').GET;
let workspaceFilePost: typeof import('@/app/api/workspace/file/route').POST;
let workspaceFilesGet: typeof import('@/app/api/workspace/files/route').GET;

let insightsGet: typeof import('@/app/api/insights/route').GET;
let insightsPost: typeof import('@/app/api/insights/route').POST;

let newsletterUnsubscribeGet: typeof import('@/app/api/newsletter/unsubscribe/route').GET;

let waitlistGet: typeof import('@/app/api/waitlist/route').GET;
let waitlistPost: typeof import('@/app/api/waitlist/route').POST;
let waitlistEmailsGet: typeof import('@/app/api/waitlist/emails/route').GET;

let webhookGithubPost: typeof import('@/app/api/webhook/github/route').POST;

let tenantsMeGet: typeof import('@/app/api/tenants/me/route').GET;
let agentsActiveGet: typeof import('@/app/api/agents/active/route').GET;
let settingsGet: typeof import('@/app/api/settings/route').GET;
let settingsPost: typeof import('@/app/api/settings/route').POST;
let statsSummaryGet: typeof import('@/app/api/stats/summary/route').GET;

function req(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): NextRequest {
  const headers = new Headers(opts.headers ?? {});
  if (opts.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

function dirent(name: string, type: 'file' | 'dir'): fs.Dirent {
  return {
    name,
    isDirectory: () => type === 'dir',
    isFile: () => type === 'file',
  } as fs.Dirent;
}

function mockSelectFromOnce(rows: unknown[]) {
  const from = jest.fn().mockResolvedValue(rows);
  mockedDb.select.mockReturnValueOnce({ from });
  return { from };
}

function mockSelectWhereLimitOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function mockSelectWhereOnce(rows: unknown[]) {
  const where = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where };
}

function mockSelectOrderByOnce(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ orderBy });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, orderBy };
}

function mockSelectOrderByLimitOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ orderBy });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, orderBy, limit };
}

function mockInsertValuesOnce(value: unknown = undefined) {
  const values = jest.fn().mockResolvedValue(value);
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values };
}

function mockInsertReturningOnce(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

function mockDeleteWhereReturningOnce(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  mockedDb.delete.mockReturnValueOnce({ where });
  return { where, returning };
}

function mockExecuteRowsOnce(rows: unknown[]) {
  mockedDb.execute.mockResolvedValueOnce({ rows });
}

beforeAll(async () => {
  process.env.WORKSPACE_PATH = '/tmp/test-workspace';
  process.env.API_SECRET = 'api-secret';
  process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
  process.env.GITHUB_PAT = 'github-pat';
  process.env.MC_DIAG_SECRET = 'diag-secret';

  ({ GET: metaHealthGet } = await import('@/app/api/meta/health/route'));
  ({ GET: metaVersionGet } = await import('@/app/api/meta/version/route'));
  ({ GET: metaDiagGet } = await import('@/app/api/meta/diag/route'));

  ({ GET: workspaceFileGet, POST: workspaceFilePost } = await import('@/app/api/workspace/file/route'));
  ({ GET: workspaceFilesGet } = await import('@/app/api/workspace/files/route'));

  ({ GET: insightsGet, POST: insightsPost } = await import('@/app/api/insights/route'));

  ({ GET: newsletterUnsubscribeGet } = await import('@/app/api/newsletter/unsubscribe/route'));

  ({ GET: waitlistGet, POST: waitlistPost } = await import('@/app/api/waitlist/route'));
  ({ GET: waitlistEmailsGet } = await import('@/app/api/waitlist/emails/route'));

  ({ POST: webhookGithubPost } = await import('@/app/api/webhook/github/route'));

  ({ GET: tenantsMeGet } = await import('@/app/api/tenants/me/route'));
  ({ GET: agentsActiveGet } = await import('@/app/api/agents/active/route'));
  ({ GET: settingsGet, POST: settingsPost } = await import('@/app/api/settings/route'));
  ({ GET: statsSummaryGet } = await import('@/app/api/stats/summary/route'));
});

describe('misc API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    process.env.MC_DIAG_SECRET = 'diag-secret';
    process.env.NEXTAUTH_URL = 'https://archonhq.ai';

    mockedAuth.mockResolvedValue(null);
    mockedExecSync.mockImplementation((command: string) => {
      if (command.includes('branch')) return Buffer.from('feat/tc-15');
      return Buffer.from('abc1234');
    });

    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
      text: async () => '',
    });
  });

  it('GET /api/meta/health returns 200 with ok payload', async () => {
    const response = await metaHealthGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.timestampUtc).toBe('string');
  });

  it('GET /api/meta/version includes package version', async () => {
    const response = await metaVersionGet();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.version).toBe(pkg.version);
    expect(json.sha).toBe('abc1234');
  });

  it('GET /api/meta/diag returns 503 when secret is missing', async () => {
    delete process.env.MC_DIAG_SECRET;

    const response = await metaDiagGet(req('http://localhost/api/meta/diag'));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'MC_DIAG_SECRET not set' });
  });

  it('GET /api/meta/diag returns 401 for invalid bearer token', async () => {
    const response = await metaDiagGet(
      req('http://localhost/api/meta/diag', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('GET /api/meta/diag returns diagnostics for valid token', async () => {
    const response = await metaDiagGet(
      req('http://localhost/api/meta/diag', {
        headers: { authorization: 'Bearer diag-secret' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        ok: true,
        sha: 'abc1234',
        branch: 'feat/tc-15',
      }),
    );
  });

  it('GET /api/workspace/file reads markdown file content', async () => {
    mockedFs.readFileSync.mockReturnValue('# Mission Control');

    const response = await workspaceFileGet(
      req('http://localhost/api/workspace/file?name=README.md', {
        headers: { 'x-tenant-id': '7' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('# Mission Control');
    expect(mockedFs.readFileSync).toHaveBeenCalledWith('/tmp/test-workspace/README.md', 'utf8');
  });

  it('POST /api/workspace/file writes markdown file content', async () => {
    const response = await workspaceFilePost(
      req('http://localhost/api/workspace/file', {
        method: 'POST',
        headers: { 'x-tenant-id': '7' },
        body: { name: 'notes.md', content: 'hello' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith('/tmp/test-workspace/notes.md', 'hello', 'utf8');
  });

  it('GET /api/workspace/files lists only allowed file types and visible dirs', async () => {
    mockedFs.readdirSync.mockImplementation((target: string) => {
      if (target === '/tmp/test-workspace') {
        return [
          dirent('README.md', 'file'),
          dirent('diagram.png', 'file'),
          dirent('.git', 'dir'),
          dirent('docs', 'dir'),
        ];
      }

      if (target === '/tmp/test-workspace/docs') {
        return [dirent('guide.md', 'file')];
      }

      throw new Error('unknown path');
    });

    const response = await workspaceFilesGet(
      req('http://localhost/api/workspace/files', {
        headers: { 'x-tenant-id': '7' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual([
      { name: 'README.md', path: 'README.md', type: 'file' },
      {
        name: 'docs',
        path: 'docs',
        type: 'dir',
        children: [{ name: 'guide.md', path: 'docs/guide.md', type: 'file' }],
      },
    ]);
  });

  it('GET /api/insights returns paginated insight rows', async () => {
    const publishedAt = new Date();
    const rows = [{ id: 1, slug: 'launch', title: 'Launch', description: 'd', publishedAt }];
    const select = mockSelectOrderByLimitOnce(rows);

    const response = await insightsGet(req('http://localhost/api/insights?limit=5'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(select.limit).toHaveBeenCalledWith(5);
    expect(json).toEqual([{ ...rows[0], publishedAt: publishedAt.toISOString() }]);
  });

  it('POST /api/insights requires bearer authentication', async () => {
    const response = await insightsPost(
      req('http://localhost/api/insights', {
        method: 'POST',
        body: {
          title: 'Archon',
          slug: 'archon',
          summary: 'Summary',
          content: 'Content',
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('POST /api/insights creates an insight article', async () => {
    const created = { id: 9, slug: 'archon-post', title: 'Archon Post' };
    const insert = mockInsertReturningOnce([created]);

    const response = await insightsPost(
      req('http://localhost/api/insights', {
        method: 'POST',
        headers: { authorization: 'Bearer api-secret' },
        body: {
          title: '  Archon Post  ',
          slug: 'archon-post',
          summary: ' Summary ',
          content: ' Content ',
        },
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(created);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Archon Post',
        slug: 'archon-post',
        description: 'Summary',
        contentMd: 'Content',
      }),
    );
  });

  it('GET /api/newsletter/unsubscribe returns 400 when token is missing', async () => {
    const response = await newsletterUnsubscribeGet(req('http://localhost/api/newsletter/unsubscribe'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing token' });
  });

  it('GET /api/newsletter/unsubscribe redirects on successful unsubscribe', async () => {
    process.env.NEXTAUTH_URL = 'https://app.archonhq.ai';
    const email = 'dev@example.com';
    const token = Buffer.from(email).toString('base64url');
    mockDeleteWhereReturningOnce([{ email }]);

    const response = await newsletterUnsubscribeGet(
      req(`http://localhost/api/newsletter/unsubscribe?token=${token}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.archonhq.ai/unsubscribe?status=ok&email=dev%40example.com',
    );
  });

  it('POST /api/waitlist adds a valid email and returns position', async () => {
    const insert = mockInsertValuesOnce();
    mockSelectFromOnce([{ count: 12 }]);
    mockSelectOrderByLimitOnce([]);

    const response = await waitlistPost(
      req('http://localhost/api/waitlist', {
        method: 'POST',
        body: { email: 'Dev@Example.com', source: 'landing' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, position: 12 });
    expect(insert.values).toHaveBeenCalledWith({ email: 'dev@example.com', source: 'landing' });
  });

  it('GET /api/waitlist returns current count', async () => {
    mockSelectFromOnce([{ count: 44 }]);

    const response = await waitlistGet();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 44 });
  });

  it('GET /api/waitlist/emails requires API bearer token', async () => {
    const response = await waitlistEmailsGet(req('http://localhost/api/waitlist/emails'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('GET /api/waitlist/emails returns subscribed addresses', async () => {
    mockSelectOrderByOnce([{ email: 'a@example.com' }, { email: 'b@example.com' }]);

    const response = await waitlistEmailsGet(
      req('http://localhost/api/waitlist/emails', {
        headers: { authorization: 'Bearer api-secret' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      emails: ['a@example.com', 'b@example.com'],
      count: 2,
    });
  });

  it('POST /api/webhook/github rejects invalid signature', async () => {
    const payload = JSON.stringify({ ref: 'refs/heads/main' });

    const response = await webhookGithubPost(
      req('http://localhost/api/webhook/github', {
        method: 'POST',
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': 'sha256=invalid',
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' });
  });

  it('POST /api/webhook/github triggers workflow on valid signed main push', async () => {
    const payload = JSON.stringify({ ref: 'refs/heads/main' });
    const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(payload).digest('hex')}`;

    const response = await webhookGithubPost(
      new NextRequest('http://localhost/api/webhook/github', {
        method: 'POST',
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256': signature,
          'content-type': 'application/json',
        },
        body: payload,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      triggered: true,
      workflow: 'deploy.yml',
      ref: 'main',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/actions/workflows/deploy.yml/dispatches'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('GET /api/tenants/me returns tenant and member count', async () => {
    mockSelectWhereLimitOnce([
      { id: 7, slug: 'acme', name: 'Acme', plan: 'team', ownerUserId: 1 },
    ]);
    mockSelectWhereOnce([
      { id: 1, userEmail: 'a@example.com' },
      { id: 2, userEmail: 'b@example.com' },
    ]);

    const response = await tenantsMeGet(
      req('http://localhost/api/tenants/me', {
        headers: { 'x-tenant-id': '7' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: 7,
        slug: 'acme',
        memberCount: 2,
      }),
    );
  });

  it('GET /api/agents/active computes working/idle/inactive statuses', async () => {
    const now = Date.now();
    mockedDb.execute.mockResolvedValueOnce({
      rows: [
        {
          agentName: 'Navi',
          tokens: 150,
          costUsd: '4.20',
          lastSeenAt: new Date(now - 2 * 60 * 1000),
        },
        {
          agentName: 'Ada',
          tokens: 30,
          costUsd: '0.80',
          lastSeenAt: new Date(now - 20 * 60 * 1000),
        },
        {
          agentName: 'Kai',
          tokens: 0,
          costUsd: null,
          lastSeenAt: new Date(now - 2 * 60 * 60 * 1000),
        },
      ],
    });

    const response = await agentsActiveGet(
      req('http://localhost/api/agents/active', {
        headers: { 'x-tenant-id': '3' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentName: 'Navi', status: 'working', tokens: 150, costUsd: '4.20' }),
        expect.objectContaining({ agentName: 'Ada', status: 'idle' }),
        expect.objectContaining({ agentName: 'Kai', status: 'inactive', costUsd: '0.00' }),
      ]),
    );
  });

  it('GET /api/settings returns decrypted settings payload', async () => {
    mockSelectWhereLimitOnce([
      {
        settings: { openaiKey: 'enc:openai-test-key', primaryAgentName: 'Navi' },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await settingsGet(
      req('http://localhost/api/settings', {
        headers: { 'x-tenant-id': '7' },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockedTryDecrypt).toHaveBeenCalledWith('enc:openai-test-key');
    expect(json).toEqual(
      expect.objectContaining({
        settings: expect.objectContaining({ openaiKey: 'openai-test-key', primaryAgentName: 'Navi' }),
      }),
    );
  });

  it('POST /api/settings validates test notification payload', async () => {
    const response = await settingsPost(
      req('http://localhost/api/settings', {
        method: 'POST',
        headers: { 'x-tenant-id': '7' },
        body: {
          testNotification: true,
          settings: { notifications: { telegramBotToken: '', telegramChatId: '' } },
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Telegram bot token and chat ID are required',
    });
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedEncrypt).not.toHaveBeenCalled();
    expect(mockedAipipeSyncTenantKeys).not.toHaveBeenCalled();
  });

  it('GET /api/stats/summary returns computed dashboard metrics', async () => {
    mockExecuteRowsOnce([{ total_tasks: 10, done_tasks: 4 }]);
    mockExecuteRowsOnce([{ active_agents: 3 }]);
    mockExecuteRowsOnce([{ total_cost_usd: '20.0000' }]);
    mockExecuteRowsOnce([{ tasks_done_today: 2 }]);
    mockExecuteRowsOnce([{ total_tokens: '500' }]);
    mockSelectWhereLimitOnce([
      {
        settings: {
          savingsRatePct: 20,
          tokenLimitMonthly: 1000,
          primaryAgentName: 'Navi',
        },
      },
    ]);
    mockExecuteRowsOnce([{ tasks_this_week: 5 }]);
    mockExecuteRowsOnce([{ current_streak: 7 }]);

    const response = await statsSummaryGet(
      req('http://localhost/api/stats/summary', {
        headers: { 'x-tenant-id': '7' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      pctComplete: 40,
      activeAgents: 3,
      totalCostUsd: '20.0000',
      savedUsd: '5.0000',
      savingsRatePct: 20,
      tasksDoneToday: 2,
      totalTasks: 10,
      doneTasks: 4,
      totalTokens: 500,
      tokenLimitMonthly: 1000,
      tokenPctOfLimit: 50,
      primaryAgentName: 'Navi',
      tasksThisWeek: 5,
      currentStreak: 7,
    });
  });
});
