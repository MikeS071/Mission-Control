import path from 'path';
import fs from 'fs';
import { NextRequest } from 'next/server';

process.env.WORKSPACE_PATH = '/tmp/test-workspace';

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    readdirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

import { resolveTenantId } from '@/lib/tenant';
import { GET as filesGet } from '@/app/api/workspace/files/route';
import { GET as fileGet, POST as filePost, DELETE as fileDelete } from '@/app/api/workspace/file/route';

type FsMock = {
  readdirSync: jest.Mock;
  readFileSync: jest.Mock;
  writeFileSync: jest.Mock;
  unlinkSync: jest.Mock;
};

const mockedFs = fs as unknown as FsMock;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const WS = process.env.WORKSPACE_PATH as string;

function makeRequest(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
  } = {},
) {
  const hasBody = opts.body !== undefined;
  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

function fileDirent(name: string) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
  };
}

function dirDirent(name: string) {
  return {
    name,
    isFile: () => false,
    isDirectory: () => true,
  };
}

describe('workspace API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveTenantId.mockResolvedValue(7);
  });

  describe('GET /api/workspace/files', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await filesGet(makeRequest('http://localhost/api/workspace/files'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedFs.readdirSync).not.toHaveBeenCalled();
    });

    it('returns a filtered file tree', async () => {
      mockedFs.readdirSync.mockImplementation((absDir: string) => {
        if (absDir === WS) {
          return [
            dirDirent('docs'),
            dirDirent('node_modules'),
            dirDirent('.git'),
            fileDirent('README.md'),
            fileDirent('image.png'),
          ];
        }

        if (absDir === path.join(WS, 'docs')) {
          return [
            fileDirent('guide.md'),
            dirDirent('drafts'),
          ];
        }

        if (absDir === path.join(WS, 'docs', 'drafts')) {
          return [
            fileDirent('plan.txt'),
            fileDirent('diagram.svg'),
          ];
        }

        return [];
      });

      const res = await filesGet(makeRequest('http://localhost/api/workspace/files'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([
        {
          name: 'docs',
          path: 'docs',
          type: 'dir',
          children: [
            { name: 'guide.md', path: 'docs/guide.md', type: 'file' },
            {
              name: 'drafts',
              path: 'docs/drafts',
              type: 'dir',
              children: [{ name: 'plan.txt', path: 'docs/drafts/plan.txt', type: 'file' }],
            },
          ],
        },
        { name: 'README.md', path: 'README.md', type: 'file' },
      ]);
    });

    it('returns an empty tree when root cannot be read', async () => {
      mockedFs.readdirSync.mockImplementation(() => {
        throw new Error('cannot read');
      });

      const res = await filesGet(makeRequest('http://localhost/api/workspace/files'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([]);
    });
  });

  describe('GET /api/workspace/file', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await fileGet(makeRequest('http://localhost/api/workspace/file?name=README.md'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when name query is missing', async () => {
      const res = await fileGet(makeRequest('http://localhost/api/workspace/file'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Missing name parameter' });
    });

    it('returns 400 for invalid extension', async () => {
      const res = await fileGet(makeRequest('http://localhost/api/workspace/file?name=image.png'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid file path' });
    });

    it('returns 400 for path traversal attempts', async () => {
      const res = await fileGet(makeRequest('http://localhost/api/workspace/file?name=../secret.md'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid file path' });
    });

    it('returns file contents for a readable file', async () => {
      mockedFs.readFileSync.mockReturnValueOnce('# hello workspace');

      const res = await fileGet(makeRequest('http://localhost/api/workspace/file?name=notes.md'));
      const text = await res.text();

      expect(res.status).toBe(200);
      expect(text).toBe('# hello workspace');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(path.resolve(WS, 'notes.md'), 'utf8');
    });

    it('returns 404 when read fails', async () => {
      mockedFs.readFileSync.mockImplementationOnce(() => {
        throw new Error('missing');
      });

      const res = await fileGet(makeRequest('http://localhost/api/workspace/file?name=missing.md'));

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ error: 'File not found' });
    });
  });

  describe('POST /api/workspace/file', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await filePost(
        makeRequest('http://localhost/api/workspace/file', {
          method: 'POST',
          body: { name: 'notes.md', content: 'x' },
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 for missing or invalid payload', async () => {
      const res = await filePost(
        makeRequest('http://localhost/api/workspace/file', {
          method: 'POST',
          body: { name: 'notes.md', content: 123 },
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Missing name or content' });
    });

    it('returns 400 when file path is not writable', async () => {
      const res = await filePost(
        makeRequest('http://localhost/api/workspace/file', {
          method: 'POST',
          body: { name: 'config.json', content: '{}' },
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid file path' });
    });

    it('writes markdown content and returns ok', async () => {
      const res = await filePost(
        makeRequest('http://localhost/api/workspace/file', {
          method: 'POST',
          body: { name: 'docs/notes.md', content: 'updated' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(path.resolve(WS, 'docs/notes.md'), 'updated', 'utf8');
    });

    it('returns 500 when write fails', async () => {
      mockedFs.writeFileSync.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      const res = await filePost(
        makeRequest('http://localhost/api/workspace/file', {
          method: 'POST',
          body: { name: 'notes.md', content: 'updated' },
        }),
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: 'Write failed' });
    });
  });

  describe('DELETE /api/workspace/file', () => {
    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await fileDelete(makeRequest('http://localhost/api/workspace/file?name=notes.md', { method: 'DELETE' }));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when name query is missing', async () => {
      const res = await fileDelete(makeRequest('http://localhost/api/workspace/file', { method: 'DELETE' }));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Missing name parameter' });
    });

    it('returns 400 for non-markdown files', async () => {
      const res = await fileDelete(makeRequest('http://localhost/api/workspace/file?name=notes.txt', { method: 'DELETE' }));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid file path' });
    });

    it('deletes markdown files and returns ok', async () => {
      const res = await fileDelete(makeRequest('http://localhost/api/workspace/file?name=notes.md', { method: 'DELETE' }));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(path.resolve(WS, 'notes.md'));
    });

    it('returns 500 when delete fails', async () => {
      mockedFs.unlinkSync.mockImplementationOnce(() => {
        throw new Error('cannot delete');
      });

      const res = await fileDelete(makeRequest('http://localhost/api/workspace/file?name=notes.md', { method: 'DELETE' }));

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: 'Delete failed' });
    });
  });
});
