import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

type GroupBy = 'model' | 'provider';

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function defaultFromDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupByParam = req.nextUrl.searchParams.get('groupBy') ?? 'model';
  if (groupByParam !== 'model' && groupByParam !== 'provider') {
    return NextResponse.json({ error: 'groupBy must be model or provider' }, { status: 400 });
  }

  const from = parseDateParam(req.nextUrl.searchParams.get('from')) ?? defaultFromDate();
  const to = parseDateParam(req.nextUrl.searchParams.get('to')) ?? new Date();

  if (!from || !to) {
    return NextResponse.json({ error: 'from/to must be ISO dates' }, { status: 400 });
  }

  const groupColumn = groupByParam === 'provider' ? sql.raw('provider') : sql.raw('model');

  const rowsResult = await db.execute(sql`
    SELECT
      ${groupColumn} AS group_key,
      COUNT(*)::int AS request_count,
      COALESCE(SUM(tokens_in), 0)::bigint::text AS tokens_in,
      COALESCE(SUM(tokens_out), 0)::bigint::text AS tokens_out,
      COALESCE(SUM(cost_usd::numeric), 0)::numeric(12,6)::text AS cost_usd,
      COALESCE(SUM(tenant_cost_usd::numeric), 0)::numeric(12,6)::text AS tenant_cost_usd,
      COALESCE(SUM(saved_usd::numeric), 0)::numeric(12,6)::text AS saved_usd
    FROM usage_ledger
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${from}
      AND created_at <= ${to}
    GROUP BY ${groupColumn}
    ORDER BY request_count DESC, group_key ASC
  `);

  const rows = rowsResult.rows as Array<{
    group_key: string;
    request_count: number;
    tokens_in: string;
    tokens_out: string;
    cost_usd: string;
    tenant_cost_usd: string;
    saved_usd: string;
  }>;

  return NextResponse.json({
    groupBy: groupByParam as GroupBy,
    from: from.toISOString(),
    to: to.toISOString(),
    items: rows.map((row) => ({
      group: row.group_key,
      requestCount: row.request_count,
      tokensIn: Number(row.tokens_in),
      tokensOut: Number(row.tokens_out),
      costUsd: row.cost_usd,
      tenantCostUsd: row.tenant_cost_usd,
      savedUsd: row.saved_usd,
    })),
  });
}
