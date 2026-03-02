import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { listPolicyAuditLogs } from '@/lib/admin/audit-log';

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session as { tenantId?: number }).tenantId !== 1) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const searchParams = new URL(req.url).searchParams;
    const tenantRaw = searchParams.get('tenantId');
    const pageRaw = searchParams.get('page');
    const limitRaw = searchParams.get('limit');

    const tenantId = parsePositiveInt(tenantRaw);
    const parsedPage = parsePositiveInt(pageRaw);
    const parsedLimit = parsePositiveInt(limitRaw);
    const page = parsedPage ?? 1;
    const limit = parsedLimit ?? 20;

    const hasInvalidTenant = tenantRaw !== null && tenantId === null;
    const hasInvalidPage = pageRaw !== null && parsedPage === null;
    const hasInvalidLimit = limitRaw !== null && parsedLimit === null;

    if (hasInvalidTenant || hasInvalidPage || hasInvalidLimit) {
      return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
    }

    const result = await listPolicyAuditLogs({ tenantId: tenantId ?? undefined, page, limit });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Admin audit log API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
