import type { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { POST as heroPost, DELETE as heroDelete } from '@/app/api/admin/content/[slug]/hero/route';

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

import { mkdir, writeFile, unlink } from 'fs/promises';

type MockDb = {
  select: jest.Mock;
  update: jest.Mock;
};

const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedDb = db as unknown as MockDb;
const mockedMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockedWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockedUnlink = unlink as jest.MockedFunction<typeof unlink>;

function makeMultipartRequest(url: string, file?: File): NextRequest {
  const form = new FormData();
  if (file) {
    form.set('file', file);
  }

  return new Request(url, {
    method: 'POST',
    body: form,
  }) as unknown as NextRequest;
}

function makeDeleteRequest(url: string): NextRequest {
  return new Request(url, {
    method: 'DELETE',
  }) as unknown as NextRequest;
}

function selectWhereLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  return { from, where, limit };
}

function updateSetWhereReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  return { set, where, returning };
}

describe('admin content hero API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@openclaw.dev' }, tenantId: 1 } as unknown);
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
    mockedUnlink.mockResolvedValue(undefined);
  });

  it('POST returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValueOnce(null);

    const res = await heroPost(
      makeMultipartRequest(
        'http://localhost/api/admin/content/demo-slug/hero',
        new File([Buffer.from('abc')], 'hero.png', { type: 'image/png' }),
      ),
      { params: Promise.resolve({ slug: 'demo-slug' }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('POST returns 400 when file is missing', async () => {
    const res = await heroPost(makeMultipartRequest('http://localhost/api/admin/content/demo-slug/hero'), {
      params: Promise.resolve({ slug: 'demo-slug' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Image file is required' });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('POST returns 404 when content item does not exist', async () => {
    const lookup = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: lookup.from });

    const res = await heroPost(
      makeMultipartRequest(
        'http://localhost/api/admin/content/missing-item/hero',
        new File([Buffer.from('abc')], 'hero.png', { type: 'image/png' }),
      ),
      { params: Promise.resolve({ slug: 'missing-item' }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Content item not found' });
    expect(mockedMkdir).not.toHaveBeenCalled();
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('POST saves image and updates hero_image_url', async () => {
    const lookup = selectWhereLimit([{ id: 77, slug: 'roadmap-update', tenantId: 1 }]);
    const update = updateSetWhereReturning([{ slug: 'roadmap-update', heroImageUrl: '/images/roadmap-update.png' }]);

    mockedDb.select.mockReturnValueOnce({ from: lookup.from });
    mockedDb.update.mockReturnValueOnce(update);

    const res = await heroPost(
      makeMultipartRequest(
        'http://localhost/api/admin/content/roadmap-update/hero',
        new File([Buffer.from('fake-image')], 'hero.png', { type: 'image/png' }),
      ),
      { params: Promise.resolve({ slug: 'roadmap-update' }) },
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({ slug: 'roadmap-update', heroImageUrl: '/images/roadmap-update.png' });
    expect(mockedMkdir).toHaveBeenCalledWith(expect.stringMatching(/public\/images$/), { recursive: true });
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/public\/images\/roadmap-update\.png$/),
      expect.any(Buffer),
    );
  });

  it('DELETE clears hero image and removes local file', async () => {
    const lookup = selectWhereLimit([{ id: 77, slug: 'roadmap-update', heroImageUrl: '/images/roadmap-update.png' }]);
    const update = updateSetWhereReturning([{ slug: 'roadmap-update', heroImageUrl: null }]);

    mockedDb.select.mockReturnValueOnce({ from: lookup.from });
    mockedDb.update.mockReturnValueOnce(update);

    const res = await heroDelete(makeDeleteRequest('http://localhost/api/admin/content/roadmap-update/hero'), {
      params: Promise.resolve({ slug: 'roadmap-update' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ slug: 'roadmap-update', heroImageUrl: null });
    expect(mockedUnlink).toHaveBeenCalledWith(expect.stringMatching(/public\/images\/roadmap-update\.png$/));
  });

  it('DELETE returns 404 for unknown content slug', async () => {
    const lookup = selectWhereLimit([]);
    mockedDb.select.mockReturnValueOnce({ from: lookup.from });

    const res = await heroDelete(makeDeleteRequest('http://localhost/api/admin/content/missing-item/hero'), {
      params: Promise.resolve({ slug: 'missing-item' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Content item not found' });
    expect(mockedUnlink).not.toHaveBeenCalled();
  });
});
