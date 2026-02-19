import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [taskTotalsResult, activeAgentsResult, totalCostResult, tasksDoneTodayResult, totalTokensResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done_tasks
      FROM tasks
      WHERE tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT agent_name)::int AS active_agents
      FROM agent_stats
      WHERE tenant_id = ${tenantId}
        AND recorded_at > NOW() - INTERVAL '24 hours'
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(cost_usd::numeric), 0)::numeric(12,2)::text AS total_cost_usd
      FROM agent_stats
      WHERE tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS tasks_done_today
      FROM tasks
      WHERE tenant_id = ${tenantId}
        AND status = 'done'
        AND updated_at > NOW() - INTERVAL '1 day'
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(tokens), 0)::bigint AS total_tokens
      FROM agent_stats
      WHERE tenant_id = ${tenantId}
    `),
  ]);

  const taskTotals = taskTotalsResult.rows[0] as { total_tasks: number; done_tasks: number } | undefined;
  const activeAgentsRow = activeAgentsResult.rows[0] as { active_agents: number } | undefined;
  const totalCostRow = totalCostResult.rows[0] as { total_cost_usd: string } | undefined;
  const doneTodayRow = tasksDoneTodayResult.rows[0] as { tasks_done_today: number } | undefined;
  const totalTokensRow = totalTokensResult.rows[0] as { total_tokens: string } | undefined;

  const totalTasks = taskTotals?.total_tasks ?? 0;
  const doneTasks = taskTotals?.done_tasks ?? 0;
  const pctComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return NextResponse.json({
    pctComplete,
    activeAgents: activeAgentsRow?.active_agents ?? 0,
    totalCostUsd: totalCostRow?.total_cost_usd ?? '0.00',
    tasksDoneToday: doneTodayRow?.tasks_done_today ?? 0,
    totalTasks,
    doneTasks,
    totalTokens: Number(totalTokensRow?.total_tokens ?? 0),
  });
}
