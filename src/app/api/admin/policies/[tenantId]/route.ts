import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { policies, policyAuditLog, tenants } from '@/db/schema';
import { resolveRules, type TenantPolicyRow } from '@/lib/policy/admin';
import { AdminPolicyUpdateSchema, type PolicyRules } from '@/lib/policy/schema';
import { applyPolicyOverrides, getDefaultPolicy } from '@/lib/policy/templates';

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if ((session as { tenantId?: number }).tenantId !== 1) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

function parseTenantId(rawTenantId: string): number | null {
  const tenantId = Number(rawTenantId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) return null;
  return tenantId;
}

async function loadTenantPolicyRow(tenantId: number): Promise<TenantPolicyRow | null> {
  const rows = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantPlan: tenants.plan,
      tier: policies.tier,
      rules: policies.rules,
      customOverrides: policies.customOverrides,
      createdAt: policies.createdAt,
      updatedAt: policies.updatedAt,
    })
    .from(tenants)
    .leftJoin(policies, eq(policies.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return (rows[0] as TenantPolicyRow | undefined) ?? null;
}

function resolveChangedById(session: unknown): number | null {
  const rawUserId = (session as { user?: { id?: unknown } }).user?.id;
  if (typeof rawUserId !== 'string') return null;
  const parsed = Number(rawUserId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const sessionOrResponse = await requireAdminSession();
    if (sessionOrResponse instanceof Response) return sessionOrResponse;

    const { tenantId: rawTenantId } = await params;
    const tenantId = parseTenantId(rawTenantId);
    if (tenantId === null) {
      return NextResponse.json({ error: 'Invalid tenant ID' }, { status: 400 });
    }

    const row = await loadTenantPolicyRow(tenantId);
    if (!row) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const resolved = resolveRules(row);
    return NextResponse.json({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      tier: resolved.tier,
      rules: resolved.rules,
      customOverrides: resolved.customOverrides,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    console.error('Admin tenant policy GET API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const sessionOrResponse = await requireAdminSession();
    if (sessionOrResponse instanceof Response) return sessionOrResponse;

    const { tenantId: rawTenantId } = await params;
    const tenantId = parseTenantId(rawTenantId);
    if (tenantId === null) {
      return NextResponse.json({ error: 'Invalid tenant ID' }, { status: 400 });
    }

    const body = await req.json();
    const payload = AdminPolicyUpdateSchema.parse(body);

    const existing = await loadTenantPolicyRow(tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const current = resolveRules(existing);
    const nextTier = payload.tier ?? current.tier;
    const nextCustomOverrides = payload.customOverrides ?? current.customOverrides;
    const nextRules = applyPolicyOverrides(getDefaultPolicy(nextTier).rules, nextCustomOverrides);
    const now = new Date();

    const [updated] = await db
      .insert(policies)
      .values({
        tenantId,
        tier: nextTier,
        rules: nextRules,
        customOverrides: nextCustomOverrides,
        createdAt: existing.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: policies.tenantId,
        set: {
          tier: nextTier,
          rules: nextRules,
          customOverrides: nextCustomOverrides,
          updatedAt: now,
        },
      })
      .returning({
        tenantId: policies.tenantId,
        tier: policies.tier,
        rules: policies.rules,
        customOverrides: policies.customOverrides,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      });

    const changedBy = resolveChangedById(sessionOrResponse);
    await db.insert(policyAuditLog).values({
      tenantId,
      changedBy,
      oldRules: current.rules,
      newRules: nextRules as PolicyRules,
      changeReason: payload.reason,
      createdAt: now,
    });

    return NextResponse.json({
      tenantId: updated?.tenantId ?? tenantId,
      tenantName: existing.tenantName,
      tier: updated?.tier ?? nextTier,
      rules: updated?.rules ?? nextRules,
      customOverrides: updated?.customOverrides ?? nextCustomOverrides,
      createdAt: updated?.createdAt ?? existing.createdAt,
      updatedAt: updated?.updatedAt ?? now,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', issues: error.issues }, { status: 400 });
    }

    console.error('Admin tenant policy PUT API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

