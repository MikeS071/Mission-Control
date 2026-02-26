import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'node:child_process';

function safe(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Dev-only, simple bearer gate.
  const expected = process.env.MC_DIAG_SECRET;
  if (!expected) return NextResponse.json({ error: 'MC_DIAG_SECRET not set' }, { status: 503 });

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sha =
    process.env.GIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    safe('git rev-parse --short HEAD') ||
    null;

  return NextResponse.json({
    ok: true,
    sha,
    branch: safe('git branch --show-current') || null,
    nodeEnv: process.env.NODE_ENV ?? null,
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestampUtc: new Date().toISOString(),
  });
}
