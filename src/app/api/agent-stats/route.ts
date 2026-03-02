import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentStats } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody, AgentStatCreateSchema } from '@/lib/validate';
import { checkLimit, getOrCreatePolicy } from '@/lib/policy';
import { checkAlerts } from '@/lib/usage/alerts';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (agent_name)
      id,
      agent_name AS "agentName",
      tokens,
      cost_usd AS "costUsd",
      recorded_at AS "recordedAt"
    FROM agent_stats
    WHERE tenant_id = ${tenantId}
    ORDER BY agent_name, recorded_at DESC
  `);

  return NextResponse.json(rows.rows);
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(AgentStatCreateSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const normalizedAgentName = body.agentName.trim();

  try {
    const policy = await getOrCreatePolicy(tenantId);
    const existingAgents = await db.execute(sql`
      SELECT DISTINCT agent_name AS "agentName"
      FROM agent_stats
      WHERE tenant_id = ${tenantId}
    `);

    const normalizedExisting = new Set(
      existingAgents.rows
        .map((row) => {
          const candidate = (row as { agentName?: unknown }).agentName;
          return typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
        })
        .filter((name) => name.length > 0),
    );

    const isNewAgent = !normalizedExisting.has(normalizedAgentName.toLowerCase());
    if (isNewAgent) {
      const gate = checkLimit(policy, 'agents', normalizedExisting.size);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: gate.reason ?? 'Agent limit reached for current plan',
            upgradePrompt: 'Upgrade to Pro to create additional agents.',
            limit: {
              key: gate.key,
              current: gate.current,
              limit: gate.limit,
              remaining: gate.remaining,
              upgradeRequired: gate.upgradeRequired ?? false,
            },
          },
          { status: 403 },
        );
      }
    }
  } catch (err) {
    console.error('[agent-stats] Failed to evaluate policy:', err);
    return NextResponse.json({ error: 'Policy evaluation failed' }, { status: 500 });
  }

  const [created] = await db
    .insert(agentStats)
    .values({
      tenantId,
      agentName: normalizedAgentName,
      tokens: body.tokens ?? 0,
      costUsd: body.costUsd ?? '0.00',
    })
    .returning();

  try {
    await checkAlerts(tenantId);
  } catch (err) {
    console.error('[agent-stats] Failed to check usage alerts:', err);
  }

  return NextResponse.json(created, { status: 201 });
}
