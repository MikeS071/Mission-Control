import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';
import { aipipeProxyChat } from '@/lib/aipipe';

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant'] as const),
  content: z.string().min(1).max(200_000),
});

const ChatRequestSchema = z.object({
  model: z.string().max(100).optional(),
  messages: z.array(MessageSchema).min(1).max(500),
  max_tokens: z.number().int().min(1).max(200_000).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(ChatRequestSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  try {
    const upstream = await aipipeProxyChat(parsed.data, String(tenantId));
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503 });
  }
}
