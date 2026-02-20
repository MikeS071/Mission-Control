import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { gatewayConnections } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { resolveTenantId } from '@/lib/tenant';
import { checkGatewayHealth, hashToken } from '@/lib/gateway';
import { parseBody, GatewayCreateSchema } from '@/lib/validate';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      id: gatewayConnections.id,
      tenantId: gatewayConnections.tenantId,
      label: gatewayConnections.label,
      url: gatewayConnections.url,
      status: gatewayConnections.status,
      lastCheckedAt: gatewayConnections.lastCheckedAt,
      createdAt: gatewayConnections.createdAt,
    })
    .from(gatewayConnections)
    .where(eq(gatewayConnections.tenantId, tenantId))
    .orderBy(desc(gatewayConnections.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(GatewayCreateSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { url, label: labelRaw, token: tokenRaw } = parsed.data;

  const label = labelRaw?.trim() || 'My Gateway';
  const token = tokenRaw?.trim();
  const tokenHash = hashToken(token ?? undefined);

  const check = await checkGatewayHealth(url, token);

  const [row] = await db
    .insert(gatewayConnections)
    .values({
      tenantId,
      label,
      url,
      tokenHash,
      status: check.status,
      lastCheckedAt: new Date(),
    })
    .returning({
      id: gatewayConnections.id,
      tenantId: gatewayConnections.tenantId,
      label: gatewayConnections.label,
      url: gatewayConnections.url,
      status: gatewayConnections.status,
      lastCheckedAt: gatewayConnections.lastCheckedAt,
      createdAt: gatewayConnections.createdAt,
    });

  return NextResponse.json({ ...row, check: { status: check.status, info: check.info } });
}
