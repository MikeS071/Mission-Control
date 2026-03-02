import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';
import { aipipeProxyChat } from '@/lib/aipipe';
import { getOrCreatePolicy, isFeatureEnabled, isModelAllowedForPolicy } from '@/lib/policy';
import { recordUsage } from '@/lib/usage/meter';
import {
  budgetHeaderValue,
  budgetResetsAt,
  checkBudget,
  UNLIMITED_BUDGET,
} from '@/lib/usage/budget';

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

type BudgetHeaders = {
  remaining: number;
  limit: number;
};

const DEFAULT_BUDGET_HEADERS: BudgetHeaders = {
  remaining: UNLIMITED_BUDGET,
  limit: UNLIMITED_BUDGET,
};

function withBudgetHeaders(response: Response, budget: BudgetHeaders): Response {
  response.headers.set('X-Budget-Remaining', budgetHeaderValue(budget.remaining));
  response.headers.set('X-Budget-Limit', budgetHeaderValue(budget.limit));
  return response;
}

function jsonWithBudget(body: unknown, init: ResponseInit, budget: BudgetHeaders): Response {
  return withBudgetHeaders(NextResponse.json(body, init), budget);
}

export async function POST(req: NextRequest) {
  let budgetHeaders = DEFAULT_BUDGET_HEADERS;

  const tenantId = await resolveTenantId(req);
  if (!tenantId) return jsonWithBudget({ error: 'Unauthorized' }, { status: 401 }, budgetHeaders);

  const parsed = parseBody(ChatRequestSchema, await req.json().catch(() => null));
  if (!parsed.ok) return withBudgetHeaders(parsed.response, budgetHeaders);

  try {
    const policy = await getOrCreatePolicy(tenantId);
    if (!isFeatureEnabled(policy, 'models')) {
      return jsonWithBudget(
        {
          error: 'Model access is disabled for your current plan.',
          upgradePrompt: 'Upgrade to Pro to unlock model access.',
        },
        { status: 403 },
        budgetHeaders,
      );
    }

    const selectedModel = parsed.data.model?.trim();
    if (selectedModel && !isModelAllowedForPolicy(policy, selectedModel)) {
      return jsonWithBudget(
        {
          error: `Model "${selectedModel}" is not available on the free tier.`,
          upgradePrompt: 'Upgrade to Pro to use premium models.',
        },
        { status: 403 },
        budgetHeaders,
      );
    }
  } catch {
    return jsonWithBudget({ error: 'Policy evaluation failed' }, { status: 500 }, budgetHeaders);
  }

  try {
    const budget = await checkBudget(tenantId);
    budgetHeaders = {
      remaining: budget.remaining,
      limit: budget.limit,
    };

    if (!budget.allowed) {
      return jsonWithBudget(
        {
          error: 'Budget exceeded',
          remaining: 0,
          limit: budget.limit,
          resetsAt: budgetResetsAt(budget.period),
        },
        { status: 429 },
        budgetHeaders,
      );
    }
  } catch {
    return jsonWithBudget({ error: 'Budget evaluation failed' }, { status: 500 }, budgetHeaders);
  }

  try {
    const upstream = await aipipeProxyChat(parsed.data, String(tenantId));
    void recordUsage(tenantId, upstream.headers).catch((error) => {
      console.warn('[usage] async metering failed:', error);
    });
    const body = await upstream.arrayBuffer();
    return withBudgetHeaders(new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    }), budgetHeaders);
  } catch {
    return jsonWithBudget({ error: 'AiPipe unavailable' }, { status: 503 }, budgetHeaders);
  }
}
