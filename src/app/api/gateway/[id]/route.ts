import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gatewayConnections } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const gatewayId = Number(id);
  if (!Number.isFinite(gatewayId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [existing] = await db
    .select({ id: gatewayConnections.id })
    .from(gatewayConnections)
    .where(and(eq(gatewayConnections.id, gatewayId), eq(gatewayConnections.tenantId, tenantId)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });

  await db
    .delete(gatewayConnections)
    .where(and(eq(gatewayConnections.id, gatewayId), eq(gatewayConnections.tenantId, tenantId)));

  return NextResponse.json({ ok: true });
}
