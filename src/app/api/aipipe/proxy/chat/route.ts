import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';
import { aipipeProxyChat } from '@/lib/aipipe';
import { getOrCreatePolicy, isFeatureEnabled, isModelAllowedForPolicy } from '@/lib/policy';
import { checkBudget } from '@/lib/usage/budget';
import { recordUsage } from '@/lib/usage/meter';

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

  const budget = await checkBudget(tenantId);
  const budgetHeaders = {
    'X-Budget-Remaining': String(budget.remaining),
    'X-Budget-Limit': String(budget.limit),
  };

  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: 'Budget exceeded',
        remaining: budget.remaining,
        limit: budget.limit,
        period: budget.period,
        resetsAt: budget.resetsAt,
      },
      { status: 429, headers: budgetHeaders },
    );
  }

  try {
    const policy = await getOrCreatePolicy(tenantId);
    if (!isFeatureEnabled(policy, 'models')) {
      return NextResponse.json(
        {
          error: 'Model access is disabled for your current plan.',
          upgradePrompt: 'Upgrade to Pro to unlock model access.',
        },
        { status: 403, headers: budgetHeaders },
      );
    }

    const selectedModel = parsed.data.model?.trim();
    if (selectedModel && !isModelAllowedForPolicy(policy, selectedModel)) {
      return NextResponse.json(
        {
          error: `Model "${selectedModel}" is not available on the free tier.`,
          upgradePrompt: 'Upgrade to Pro to use premium models.',
        },
        { status: 403, headers: budgetHeaders },
      );
    }
  } catch {
    return NextResponse.json({ error: 'Policy evaluation failed' }, { status: 500, headers: budgetHeaders });
  }

  try {
    const upstream = await aipipeProxyChat(parsed.data, String(tenantId));
    const body = await upstream.arrayBuffer();
    void recordUsage(tenantId, upstream.headers);
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        ...budgetHeaders,
      },
    });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503, headers: budgetHeaders });
  }
}
