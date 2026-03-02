import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { policies, policyAuditLog, tenants } from '@/db/schema';
import { resolveRules, type TenantPolicyRow } from '@/lib/policy/admin';
import { getDefaultPolicy } from '@/lib/policy/templates';

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

function resolveChangedById(session: unknown): number | null {
  const rawUserId = (session as { user?: { id?: unknown } }).user?.id;
  if (typeof rawUserId !== 'string') return null;
  const parsed = Number(rawUserId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
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

export async function POST(
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

    const existing = await loadTenantPolicyRow(tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const current = resolveRules(existing);
    const resetRules = getDefaultPolicy(current.tier).rules;
    const now = new Date();

    const [updated] = await db
      .insert(policies)
      .values({
        tenantId,
        tier: current.tier,
        rules: resetRules,
        customOverrides: [],
        createdAt: existing.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: policies.tenantId,
        set: {
          tier: current.tier,
          rules: resetRules,
          customOverrides: [],
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
      newRules: resetRules,
      changeReason: 'Reset to tier defaults',
      createdAt: now,
    });

    return NextResponse.json({
      tenantId: updated?.tenantId ?? tenantId,
      tenantName: existing.tenantName,
      tier: updated?.tier ?? current.tier,
      rules: updated?.rules ?? resetRules,
      customOverrides: updated?.customOverrides ?? [],
      createdAt: updated?.createdAt ?? existing.createdAt,
      updatedAt: updated?.updatedAt ?? now,
    });
  } catch (error) {
    console.error('Admin tenant policy reset API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

