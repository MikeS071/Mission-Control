import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function safeGit(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
  } catch {
    return null;
  }
}

function safePackageVersion(): string | null {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const sha =
    process.env.GIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    safeGit('git rev-parse --short HEAD') ||
    null;

  const branch = safeGit('git branch --show-current') || null;

  return NextResponse.json({
    version: safePackageVersion(),
    sha,
    branch,
    nodeEnv: process.env.NODE_ENV ?? null,
    timestampUtc: new Date().toISOString(),
  });
}
