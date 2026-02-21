import { NextRequest, NextResponse } from 'next/server';

const COOLIFY_URL = 'http://100.116.243.21:8000';
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN ?? '';
const APP_UUID = process.env.COOLIFY_APP_UUID ?? 'w884wcw8g8co44k4cgssc8cw';
const DEPLOY_SECRET = process.env.DEPLOY_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  // Validate deploy secret
  const secret = req.headers.get('x-deploy-secret');
  if (!DEPLOY_SECRET || !secret || secret !== DEPLOY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${COOLIFY_URL}/api/v1/deploy?uuid=${APP_UUID}&force=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${COOLIFY_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error('[deploy] Coolify error:', body);
      return NextResponse.json(
        { error: 'Coolify deploy failed', detail: body },
        { status: 502 }
      );
    }

    console.log('[deploy] Coolify deploy triggered:', body);
    return NextResponse.json({ ok: true, coolify: body });
  } catch (err) {
    console.error('[deploy] fetch error:', err);
    return NextResponse.json(
      { error: 'Internal error', detail: String(err) },
      { status: 500 }
    );
  }
}
