import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET  = process.env.GITHUB_WEBHOOK_SECRET ?? '';
const COOLIFY_API_URL = process.env.COOLIFY_API_URL ?? 'http://localhost:8000';
const COOLIFY_TOKEN   = process.env.COOLIFY_API_TOKEN ?? '';
const COOLIFY_APP_UUID = process.env.COOLIFY_APP_UUID ?? 'w884wcw8g8co44k4cgssc8cw';

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
  const rawBody  = await req.text();
  const ghSig    = req.headers.get('x-hub-signature-256') ?? '';
  const ghEvent  = req.headers.get('x-github-event') ?? '';

  if (!verify(WEBHOOK_SECRET, rawBody, ghSig)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only redeploy on push to main
  if (ghEvent !== 'push') {
    return NextResponse.json({ skipped: true, reason: 'not a push event' });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { body = {}; }

  const ref = (body.ref as string) ?? '';
  if (ref !== 'refs/heads/main') {
    return NextResponse.json({ skipped: true, reason: `push to ${ref}, not main` });
  }

  // Trigger Coolify redeploy
  const res = await fetch(
    `${COOLIFY_API_URL}/api/v1/applications/${COOLIFY_APP_UUID}/deploy`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COOLIFY_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await res.json().catch(() => ({}));
  console.log('[webhook] Coolify deploy triggered:', data);

  return NextResponse.json({ triggered: true, coolify: data });
}
