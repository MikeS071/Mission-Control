import type { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { listTemplatesWithSyncStatus, syncTemplates } from '@/lib/provisioning/templateSync';

import { GET as templatesGet, POST as templatesPost } from '@/app/api/admin/provision/templates/route';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/provisioning/templateSync', () => ({
  listTemplatesWithSyncStatus: jest.fn(),
  syncTemplates: jest.fn(),
}));

const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedListTemplatesWithSyncStatus = listTemplatesWithSyncStatus as jest.MockedFunction<
  typeof listTemplatesWithSyncStatus
>;
const mockedSyncTemplates = syncTemplates as jest.MockedFunction<typeof syncTemplates>;

function makeRequest(method: 'GET' | 'POST', url: string): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

describe('admin provision templates API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PROVISION_TEMPLATE_SOURCE_DIR = '/tmp/source-templates';
    process.env.PROVISION_TEMPLATE_TARGET_DIR = '/tmp/target-templates';
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
  });

  it('GET returns 401 for unauthenticated requests', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const response = await templatesGet(makeRequest('GET', 'http://localhost/api/admin/provision/templates'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedListTemplatesWithSyncStatus).not.toHaveBeenCalled();
  });

  it('GET returns available templates with last-synced timestamps for admins', async () => {
    mockedListTemplatesWithSyncStatus.mockResolvedValueOnce([
      { path: 'workspace.json', lastSyncedAt: '2026-03-01T12:00:00.000Z' },
      { path: 'settings/.env', lastSyncedAt: null },
    ]);

    const response = await templatesGet(makeRequest('GET', 'http://localhost/api/admin/provision/templates'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      templates: [
        { path: 'workspace.json', lastSyncedAt: '2026-03-01T12:00:00.000Z' },
        { path: 'settings/.env', lastSyncedAt: null },
      ],
    });
    expect(mockedListTemplatesWithSyncStatus).toHaveBeenCalledWith('/tmp/source-templates', '/tmp/target-templates');
  });

  it('POST returns 403 for non-admin users', async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: 'user@tenant.dev' }, tenantId: 2 } as unknown);

    const response = await templatesPost(makeRequest('POST', 'http://localhost/api/admin/provision/templates'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Admin access required' });
    expect(mockedSyncTemplates).not.toHaveBeenCalled();
  });

  it('POST triggers manual template sync for admins', async () => {
    mockedSyncTemplates.mockResolvedValueOnce({
      synced: ['workspace.json', 'settings/.env'],
      skipped: ['README.md'],
      errors: [],
    });

    const response = await templatesPost(makeRequest('POST', 'http://localhost/api/admin/provision/templates'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      synced: ['workspace.json', 'settings/.env'],
      skipped: ['README.md'],
      errors: [],
    });
    expect(mockedSyncTemplates).toHaveBeenCalledWith('/tmp/source-templates', '/tmp/target-templates');
  });

  it('POST returns 500 when sync throws', async () => {
    mockedSyncTemplates.mockRejectedValueOnce(new Error('sync exploded'));

    const response = await templatesPost(makeRequest('POST', 'http://localhost/api/admin/provision/templates'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'sync exploded' });
  });
});
