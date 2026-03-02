import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody } from '@/lib/validate';
import { aipipeProxyMessages } from '@/lib/aipipe';
import { recordUsage } from '@/lib/usage/meter';
import {
  budgetHeaderValue,
  budgetResetsAt,
  checkBudget,
  UNLIMITED_BUDGET,
} from '@/lib/usage/budget';

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

  const parsed = parseBody(MessagesRequestSchema, await req.json().catch(() => null));
  if (!parsed.ok) return withBudgetHeaders(parsed.response, budgetHeaders);

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
    const upstream = await aipipeProxyMessages(parsed.data, String(tenantId));
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
