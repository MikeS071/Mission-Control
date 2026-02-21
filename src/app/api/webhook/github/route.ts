import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const GITHUB_PAT     = process.env.GITHUB_PAT ?? '';

const REPO_OWNER = 'MikeS071';
const REPO_NAME  = 'Mission-Control';
const WORKFLOW   = 'deploy.yml';
const DEPLOY_REF = 'main';

function verify(secret: string, payload: string, sig: string): boolean {
  if (!secret || !sig) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const ghSig   = req.headers.get('x-hub-signature-256') ?? '';
  const ghEvent = req.headers.get('x-github-event') ?? '';

  if (!verify(WEBHOOK_SECRET, rawBody, ghSig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only redeploy on push events
  if (ghEvent !== 'push') {
    return NextResponse.json({ skipped: true, reason: 'not a push event' });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { body = {}; }

  const ref = (body.ref as string) ?? '';
  if (ref !== 'refs/heads/main') {
    return NextResponse.json({ skipped: true, reason: `push to ${ref}, not main` });
  }

  // Trigger GitHub Actions workflow_dispatch (Coolify is decommissioned)
  if (!GITHUB_PAT) {
    console.error('[webhook/github] GITHUB_PAT is not set — cannot trigger workflow_dispatch');
    return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 });
  }

  const dispatchUrl =
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW}/dispatches`;

  const res = await fetch(dispatchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_PAT}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: DEPLOY_REF }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[webhook/github] workflow_dispatch failed:', res.status, errText);
    return NextResponse.json(
      { error: 'Failed to trigger GitHub Actions workflow', status: res.status, detail: errText },
      { status: 502 }
    );
  }

  // GitHub returns 204 No Content on success
  return NextResponse.json({ triggered: true, workflow: WORKFLOW, ref: DEPLOY_REF });
}
