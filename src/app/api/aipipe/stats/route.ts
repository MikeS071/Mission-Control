import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { aipipeStats, aipipeTenantStats, estimateSavingsPercent } from '@/lib/aipipe';
import { filterModelsForPolicy, getOrCreatePolicy, isFeatureEnabled } from '@/lib/policy';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Fetch global model health stats and per-tenant cost/request stats in parallel.
    const [stats, tenantStats, policy] = await Promise.all([
      aipipeStats(),
      aipipeTenantStats(String(tenantId)),
      getOrCreatePolicy(tenantId),
    ]);

    const savingsPercent = estimateSavingsPercent(stats);
    const modelsEnabled = isFeatureEnabled(policy, 'models');
    const filteredRuntimeModels = modelsEnabled
      ? filterModelsForPolicy(policy, stats.runtime.models)
      : [];
    const filteredTrackingModels = modelsEnabled
      ? filterModelsForPolicy(policy, stats.model_tracking)
      : [];

    return NextResponse.json({
      ...stats,
      runtime: {
        ...stats.runtime,
        models: filteredRuntimeModels,
      },
      model_tracking: filteredTrackingModels,
      savingsPercent,
      // Per-tenant overlay — null if admin secret not configured or no data yet.
      tenant: tenantStats,
    });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503 });
  }
}
