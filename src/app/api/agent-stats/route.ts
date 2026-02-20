import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentStats } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { parseBody, AgentStatCreateSchema } from '@/lib/validate';

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

  const [created] = await db
    .insert(agentStats)
    .values({
      tenantId,
      agentName: body.agentName.trim(),
      tokens: body.tokens ?? 0,
      costUsd: body.costUsd ?? '0.00',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
