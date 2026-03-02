import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

type UsagePeriod = 'daily' | 'monthly';

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getDefaultFrom(period: UsagePeriod): Date {
  const now = new Date();
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
}

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const periodParam = req.nextUrl.searchParams.get('period') ?? 'daily';
  if (periodParam !== 'daily' && periodParam !== 'monthly') {
    return NextResponse.json({ error: 'period must be daily or monthly' }, { status: 400 });
  }

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const fromDate = fromParam ? parseDateParam(fromParam) : getDefaultFrom(periodParam);
  const toDate = toParam ? parseDateParam(toParam) : new Date();

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'from/to must be ISO dates' }, { status: 400 });
  }

  const rowsResult = await db.execute(sql`
    SELECT
      period,
      period_start,
      total_tokens_in::bigint::text AS total_tokens_in,
      total_tokens_out::bigint::text AS total_tokens_out,
      total_cost_usd::numeric(12,6)::text AS total_cost_usd,
      total_saved_usd::numeric(12,6)::text AS total_saved_usd,
      request_count::int AS request_count,
      cache_hits::int AS cache_hits
    FROM usage_summary
    WHERE tenant_id = ${tenantId}
      AND period = ${periodParam}
      AND period_start >= ${fromDate}
      AND period_start <= ${toDate}
    ORDER BY period_start ASC
  `);

  const rows = rowsResult.rows as Array<{
    period: UsagePeriod;
    period_start: string | Date;
    total_tokens_in: string;
    total_tokens_out: string;
    total_cost_usd: string;
    total_saved_usd: string;
    request_count: number;
    cache_hits: number;
  }>;

  return NextResponse.json({
    period: periodParam,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    items: rows.map((row) => ({
      period: row.period,
      periodStart: new Date(row.period_start).toISOString(),
      totalTokensIn: Number(row.total_tokens_in),
      totalTokensOut: Number(row.total_tokens_out),
      totalCostUsd: row.total_cost_usd,
      totalSavedUsd: row.total_saved_usd,
      requestCount: row.request_count,
      cacheHits: row.cache_hits,
    })),
  });
}
