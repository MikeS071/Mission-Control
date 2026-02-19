import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { gatewayConnections } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';
import { checkGatewayHealth } from '@/lib/gateway';

type RouteContext = { params: Promise<{ id: string }> };
type CheckBody = { token?: string };

export async function POST(req: NextRequest, context: RouteContext) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const gatewayId = Number(id);
  if (!Number.isFinite(gatewayId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const [existing] = await db
    .select()
    .from(gatewayConnections)
    .where(and(eq(gatewayConnections.id, gatewayId), eq(gatewayConnections.tenantId, tenantId)))
    .limit(1);

  if (!existing) return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as CheckBody;
  const check = await checkGatewayHealth(existing.url, body.token?.trim());

  const [updated] = await db
    .update(gatewayConnections)
    .set({ status: check.status, lastCheckedAt: new Date() })
    .where(and(eq(gatewayConnections.id, gatewayId), eq(gatewayConnections.tenantId, tenantId)))
    .returning({
      id: gatewayConnections.id,
      tenantId: gatewayConnections.tenantId,
      label: gatewayConnections.label,
      url: gatewayConnections.url,
      status: gatewayConnections.status,
      lastCheckedAt: gatewayConnections.lastCheckedAt,
      createdAt: gatewayConnections.createdAt,
    });

  return NextResponse.json({ ...updated, check: { status: check.status, info: check.info } });
}
