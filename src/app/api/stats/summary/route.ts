import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenantSettings } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [taskTotalsResult, activeAgentsResult, totalCostResult, tasksDoneTodayResult, totalTokensResult, settingsRow] = await Promise.all([
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
      SELECT COALESCE(SUM(cost_usd::numeric), 0)::numeric(12,4)::text AS total_cost_usd
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
    db.select({ settings: tenantSettings.settings })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1),
  ]);

  const taskTotals = taskTotalsResult.rows[0] as { total_tasks: number; done_tasks: number } | undefined;
  const activeAgentsRow = activeAgentsResult.rows[0] as { active_agents: number } | undefined;
  const totalCostRow = totalCostResult.rows[0] as { total_cost_usd: string } | undefined;
  const doneTodayRow = tasksDoneTodayResult.rows[0] as { tasks_done_today: number } | undefined;
  const totalTokensRow = totalTokensResult.rows[0] as { total_tokens: string } | undefined;
  const settings = (settingsRow[0]?.settings ?? {}) as {
    savingsRatePct?: number;
    tokenLimitMonthly?: number;
    primaryAgentName?: string;
  };

  const totalTasks = taskTotals?.total_tasks ?? 0;
  const doneTasks = taskTotals?.done_tasks ?? 0;
  const pctComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const totalCostUsd = parseFloat(totalCostRow?.total_cost_usd ?? '0');
  const savingsRatePct = settings.savingsRatePct ?? 30; // default 30% savings via AiPipe
  // If we paid X at reduced rate, direct cost would have been X / (1 - rate)
  // savings = directCost - X = X * rate / (1 - rate)
  const directRate = savingsRatePct / 100;
  const savedUsd = directRate > 0 && directRate < 1
    ? totalCostUsd * directRate / (1 - directRate)
    : 0;

  const totalTokens = Number(totalTokensRow?.total_tokens ?? 0);
  const tokenLimitMonthly = settings.tokenLimitMonthly ?? 0;
  const tokenPctOfLimit = tokenLimitMonthly > 0
    ? Math.min(100, Math.round((totalTokens / tokenLimitMonthly) * 100))
    : null;

  return NextResponse.json({
    pctComplete,
    activeAgents: activeAgentsRow?.active_agents ?? 0,
    totalCostUsd: totalCostUsd.toFixed(4),
    savedUsd: savedUsd.toFixed(4),
    savingsRatePct,
    tasksDoneToday: doneTodayRow?.tasks_done_today ?? 0,
    totalTasks,
    doneTasks,
    totalTokens,
    tokenLimitMonthly,
    tokenPctOfLimit,
    primaryAgentName: settings.primaryAgentName ?? null,
  });
}
