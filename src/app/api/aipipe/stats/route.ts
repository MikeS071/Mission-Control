import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { aipipeStats, estimateSavingsPercent } from '@/lib/aipipe';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = await aipipeStats();
    const savingsPercent = estimateSavingsPercent(stats);

    return NextResponse.json({ ...stats, savingsPercent });
  } catch {
    return NextResponse.json({ error: 'AiPipe unavailable' }, { status: 503 });
  }
}
