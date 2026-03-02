import path from 'node:path';

import { resolveTurbopackRoot } from '@/lib/build-config';

describe('resolveTurbopackRoot', () => {
  it('uses INIT_CWD when provided', () => {
    const root = resolveTurbopackRoot(
      {
        INIT_CWD: '/repo/root',
      },
      '/repo/root/src/app',
    );

    expect(root).toBe(path.resolve('/repo/root'));
  });

  it('falls back to npm_package_json directory when INIT_CWD is missing', () => {
    const root = resolveTurbopackRoot(
      {
        npm_package_json: '/repo/root/package.json',
      },
      '/repo/root/src/app',
    );

    expect(root).toBe(path.resolve('/repo/root'));
  });

  it('falls back to process cwd when no npm metadata is available', () => {
    const root = resolveTurbopackRoot({}, '/repo/root/src/app');

    expect(root).toBe(path.resolve('/repo/root/src/app'));
  });

  it('walks up to find a parent node_modules/next/package.json', () => {
    const existingPath = path.resolve('/repo/node_modules/next/package.json');
    const root = resolveTurbopackRoot(
      {},
      '/repo/.-worktrees/tst-1/src/app',
      (candidate: string) => candidate === existingPath,
    );

    expect(root).toBe(path.resolve('/repo'));
  });
});
