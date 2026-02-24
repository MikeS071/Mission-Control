import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { openclawChatSend } from '@/lib/openclaw-chat';

function parseConvId(req: NextRequest): string | null {
  const raw = req.headers.get('x-mc-conv-id');
  if (!raw) return null;
  const s = raw.trim();
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(s)) return null;
  return s;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  message: z.string().min(1).max(10_000),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

function makeIdempotencyKey(): string {
  return `mc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  }

  const message = parsed.data.message.trim();
  const idempotencyKey = parsed.data.idempotencyKey ?? makeIdempotencyKey();
  const convId = parseConvId(req);

  try {
    const { runId, status } = await openclawChatSend({ tenantId, convId, message, idempotencyKey });
    return NextResponse.json({ ok: true, runId, status, idempotencyKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Gateway error', details: msg }, { status: 502 });
  }
}
