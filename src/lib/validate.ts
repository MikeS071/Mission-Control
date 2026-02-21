import { z, ZodSchema } from 'zod';
import { NextResponse } from 'next/server';

type ParseOk<T> = { ok: true; data: T };
type ParseFail = { ok: false; response: NextResponse };

/**
 * Safely parses an unknown value against a Zod schema.
 * Returns { ok: true, data } on success, or { ok: false, response } with a 400 on failure.
 * Usage:
 *   const parsed = parseBody(MySchema, await req.json())
 *   if (!parsed.ok) return parsed.response
 *   const { field } = parsed.data
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): ParseOk<T> | ParseFail {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ');
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}

// ─── Shared enums ─────────────────────────────────────────────────────────────

export const TaskStatusEnum = z.enum(['backlog', 'in_progress', 'in progress', 'assigned', 'review', 'done', 'complete', 'completed',
  'todo', // kept for backwards compatibility — normalised to 'backlog' on write
] as const);
export const TaskPriorityEnum = z.enum(['low', 'Low', 'medium', 'Medium', 'high', 'High', 'critical', 'Critical'] as const);

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean(),
});

export const TaskCreateSchema = z.object({
  title: z.string().min(1, 'title is required').max(200),
  description: z.string().max(5000).optional(),
  goal: z.string().max(100).optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  tags: z.string().max(500).optional(),
  assignedAgent: z.string().max(100).nullable().optional(),
  assigned_agent: z.string().max(100).nullable().optional(),
  checklist: z.union([
    z.string(),
    z.array(ChecklistItemSchema),
  ]).optional(),
});

export const TaskPatchSchema = TaskCreateSchema.partial();

export const EventCreateSchema = z.object({
  taskId: z.number().int().positive().nullable().optional(),
  agentName: z.string().max(100).nullable().optional(),
  eventType: z.string().min(1, 'eventType is required').max(80),
  payload: z.string().max(2000).optional(),
});

export const AgentStatCreateSchema = z.object({
  agentName: z.string().min(1, 'agentName is required').max(100),
  tokens: z.number().int().min(0).optional(),
  costUsd: z.string().max(20).optional(),
});

export const BillingCheckoutSchema = z.object({
  plan: z.enum(['strategos', 'archon', 'pro', 'team'] as const, {
    message: 'plan must be strategos, archon, pro, or team',
  }),
  billingCycle: z.enum(['monthly', 'yearly'] as const).optional(),
});

export const GatewayCreateSchema = z.object({
  label: z.string().max(100).optional(),
  url: z.string().url('url must be a valid URL').max(500),
  token: z.string().max(500).optional(),
});

export const FeatureRequestSchema = z.object({
  email: z.string().email('Invalid email').max(200),
  description: z.string().min(1, 'description is required').max(2000),
});
