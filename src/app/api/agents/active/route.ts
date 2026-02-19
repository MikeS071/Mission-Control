import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

type AgentStatus = 'working' | 'idle' | 'inactive';

function computeStatus(lastSeenAt: Date): AgentStatus {
  const now = Date.now();
  const ageMs = now - new Date(lastSeenAt).getTime();
  if (ageMs <= 5 * 60 * 1000) return 'working';
  if (ageMs <= 60 * 60 * 1000) return 'idle';
  return 'inactive';
}

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (agent_name)
      agent_name AS "agentName",
      tokens,
      cost_usd AS "costUsd",
      recorded_at AS "lastSeenAt"
    FROM agent_stats
    WHERE tenant_id = ${tenantId}
    ORDER BY agent_name, recorded_at DESC
  `);

  const data = rows.rows.map((row) => {
    const lastSeenAt = new Date((row as { lastSeenAt: Date }).lastSeenAt);
    return {
      agentName: (row as { agentName: string }).agentName,
      tokens: Number((row as { tokens: number | null }).tokens ?? 0),
      costUsd: String((row as { costUsd: string | null }).costUsd ?? '0.00'),
      lastSeenAt: lastSeenAt.toISOString(),
      status: computeStatus(lastSeenAt),
    };
  });

  return NextResponse.json(data);
}
