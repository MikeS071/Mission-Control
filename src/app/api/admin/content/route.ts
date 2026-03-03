import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { listContent } from '@/lib/content';

const allowedStatuses = new Set(['all', 'draft', 'qa', 'published', 'deleted']);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = Number((session as { tenantId?: unknown }).tenantId);
  if (tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const rawStatus = req.nextUrl.searchParams.get('status')?.trim().toLowerCase();
  const status = rawStatus || undefined;
  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() || undefined;
  const items = await listContent(tenantId, {
    status: status && status !== 'all' ? status : undefined,
    query,
    includeDeleted: status === 'deleted',
  });

  return NextResponse.json({ items, total: items.length });
}
