import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantId } from '@/lib/tenant';
import { aipipeHealthy } from '@/lib/aipipe';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const healthy = await aipipeHealthy();
  return NextResponse.json(
    { status: healthy ? 'ok' : 'unavailable' },
    { status: healthy ? 200 : 503 }
  );
}
