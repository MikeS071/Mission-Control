import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';
import { aipipeProxyMessages } from '@/lib/aipipe';

const AnthropicMessageSchema = z.object({
  role: z.enum(['user', 'assistant'] as const),
  content: z.string().min(1).max(200_000),
});

const MessagesRequestSchema = z.object({
  model: z.string().max(100).optional(),
  system: z.string().max(50_000).optional(),
  messages: z.array(AnthropicMessageSchema).min(1).max(500),
  max_tokens: z.number().int().min(1).max(200_000).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(MessagesRequestSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  try {
    const upstream = await aipipeProxyMessages(parsed.data);
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503 });
  }
}
