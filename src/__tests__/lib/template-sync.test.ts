import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { syncTemplates } from '@/lib/provisioning/templateSync';

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(root: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(root, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

describe('syncTemplates', () => {
  it('copies only changed and new files while skipping unchanged files', async () => {
    const tempRoot = await makeTempDir('template-sync-');
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'target');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    await writeFile(sourceDir, 'unchanged.json', '{"name":"same"}');
    await writeFile(sourceDir, 'changed.json', '{"name":"new"}');
    await writeFile(sourceDir, 'nested/new.env', 'TOKEN=abc123');

    await writeFile(targetDir, 'unchanged.json', '{"name":"same"}');
    await writeFile(targetDir, 'changed.json', '{"name":"old"}');

    const result = await syncTemplates(sourceDir, targetDir);

    expect(result.synced.sort()).toEqual(['changed.json', 'nested/new.env']);
    expect(result.skipped).toEqual(['unchanged.json']);
    expect(result.errors).toEqual([]);

    await expect(fs.readFile(path.join(targetDir, 'changed.json'), 'utf8')).resolves.toBe('{"name":"new"}');
    await expect(fs.readFile(path.join(targetDir, 'nested/new.env'), 'utf8')).resolves.toBe('TOKEN=abc123');

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('respects .template-ignore exclusion rules', async () => {
    const tempRoot = await makeTempDir('template-sync-ignore-');
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'target');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    await writeFile(sourceDir, '.template-ignore', '# comment\nignored.txt\n*.tmp\nnested/*\n');
    await writeFile(sourceDir, 'kept.md', '# keep');
    await writeFile(sourceDir, 'ignored.txt', 'ignore me');
    await writeFile(sourceDir, 'scratch.tmp', 'ignore tmp file');
    await writeFile(sourceDir, 'nested/deep.md', 'ignore nested');

    const result = await syncTemplates(sourceDir, targetDir);

    expect(result.synced).toEqual(['kept.md']);
    expect(result.skipped.sort()).toEqual(['ignored.txt', 'nested/deep.md', 'scratch.tmp']);
    expect(result.errors).toEqual([]);

    await expect(fs.readFile(path.join(targetDir, 'kept.md'), 'utf8')).resolves.toBe('# keep');
    await expect(fs.stat(path.join(targetDir, 'ignored.txt'))).rejects.toThrow();

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns per-file errors and keeps syncing remaining files', async () => {
    const tempRoot = await makeTempDir('template-sync-errors-');
    const sourceDir = path.join(tempRoot, 'source');
    const targetDir = path.join(tempRoot, 'target');

    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    await writeFile(sourceDir, 'broken.txt', 'cannot overwrite target directory');
    await writeFile(sourceDir, 'good.txt', 'this should still sync');

    await fs.mkdir(path.join(targetDir, 'broken.txt'), { recursive: true });

    const result = await syncTemplates(sourceDir, targetDir);

    expect(result.synced).toEqual(['good.txt']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('broken.txt');

    await expect(fs.readFile(path.join(targetDir, 'good.txt'), 'utf8')).resolves.toBe('this should still sync');

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
