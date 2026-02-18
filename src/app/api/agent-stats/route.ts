import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentStats } from '@/db/schema';

type AgentStatInput = {
  agentName?: string;
  tokens?: number;
  costUsd?: string;
};

export async function GET() {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (agent_name)
      id,
      agent_name AS "agentName",
      tokens,
      cost_usd AS "costUsd",
      recorded_at AS "recordedAt"
    FROM agent_stats
    ORDER BY agent_name, recorded_at DESC
  `);

  return NextResponse.json(rows.rows);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AgentStatInput;
  if (!body.agentName?.trim()) {
    return NextResponse.json({ error: 'agentName is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(agentStats)
    .values({
      agentName: body.agentName.trim(),
      tokens: Number.isFinite(body.tokens) ? Number(body.tokens) : 0,
      costUsd: body.costUsd ?? '0.00',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
