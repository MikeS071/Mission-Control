import path from 'node:path';
import { existsSync } from 'node:fs';

type EnvMap = Readonly<Record<string, string | undefined>>;
type ExistsFn = (candidate: string) => boolean;

export function resolveTurbopackRoot(
  env: EnvMap = process.env,
  cwd = process.cwd(),
  pathExists: ExistsFn = existsSync,
): string {
  const initCwd = env.INIT_CWD?.trim();
  if (initCwd) {
    const resolved = resolveByNodeModules(path.resolve(initCwd), pathExists);
    if (resolved) {
      return resolved;
    }

    return path.resolve(initCwd);
  }

  const npmPackageJson = env.npm_package_json?.trim();
  if (npmPackageJson) {
    const packageRoot = path.dirname(path.resolve(npmPackageJson));
    const resolved = resolveByNodeModules(packageRoot, pathExists);
    if (resolved) {
      return resolved;
    }

    return packageRoot;
  }

  const cwdRoot = resolveByNodeModules(path.resolve(cwd), pathExists);
  if (cwdRoot) {
    return cwdRoot;
  }

  return path.resolve(cwd);
}

function resolveByNodeModules(startDir: string, pathExists: ExistsFn): string | null {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, 'node_modules', 'next', 'package.json');
    if (pathExists(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}
