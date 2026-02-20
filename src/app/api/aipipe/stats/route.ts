import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { aipipeStats, aipipeTenantStats, estimateSavingsPercent } from '@/lib/aipipe';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Fetch global model health stats and per-tenant cost/request stats in parallel.
    const [stats, tenantStats] = await Promise.all([
      aipipeStats(),
      aipipeTenantStats(String(tenantId)),
    ]);

    const savingsPercent = estimateSavingsPercent(stats);

    return NextResponse.json({
      ...stats,
      savingsPercent,
      // Per-tenant overlay — null if admin secret not configured or no data yet.
      tenant: tenantStats,
    });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503 });
  }
}
