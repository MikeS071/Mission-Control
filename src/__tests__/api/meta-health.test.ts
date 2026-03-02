import { NextRequest } from 'next/server';
import { execSync } from 'node:child_process';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

import { GET as metaDiagGet } from '@/app/api/meta/diag/route';
import { GET as metaHealthGet } from '@/app/api/meta/health/route';
import { GET as metaVersionGet } from '@/app/api/meta/version/route';
import { GET as healthGet } from '@/app/api/health/route';

const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

const ORIGINAL_ENV = process.env;

describe('meta and health API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.MC_DIAG_SECRET;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('GET /api/health returns 200 with ok and numeric ts', async () => {
    const res = await healthGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.ts).toBe('number');
  });

  it('GET /api/meta/health returns 200 without auth', async () => {
    const res = await metaHealthGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true });
    expect(typeof json.timestampUtc).toBe('string');
  });

  it('GET /api/meta/version returns version string and works without auth', async () => {
    process.env.GIT_SHA = 'v1.2.3-test';

    const res = await metaVersionGet();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sha).toBe('v1.2.3-test');
    expect(typeof json.timestampUtc).toBe('string');
  });

  it('GET /api/meta/diag returns 503 when MC_DIAG_SECRET is not set', async () => {
    const req = new NextRequest('http://localhost/api/meta/diag');

    const res = await metaDiagGet(req);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'MC_DIAG_SECRET not set' });
  });

  it('GET /api/meta/diag returns 401 when auth is missing', async () => {
    process.env.MC_DIAG_SECRET = 'diag-secret';
    const req = new NextRequest('http://localhost/api/meta/diag');

    const res = await metaDiagGet(req);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('GET /api/meta/diag returns diagnostic payload with valid bearer token', async () => {
    process.env.MC_DIAG_SECRET = 'diag-secret';
    process.env.GIT_SHA = 'abc1234';
    mockedExecSync.mockReturnValue(Buffer.from('main\n') as never);

    const req = new NextRequest('http://localhost/api/meta/diag', {
      headers: { authorization: 'Bearer diag-secret' },
    });

    const res = await metaDiagGet(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.sha).toBe('abc1234');
    expect(json.branch).toBe('main');
    expect(typeof json.pid).toBe('number');
    expect(typeof json.uptimeSec).toBe('number');
    expect(typeof json.timestampUtc).toBe('string');
    expect(json.memory).toBeDefined();
  });
});
