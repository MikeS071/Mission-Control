import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { memberships, tenants, users } from '@/db/schema';

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session as any).tenantId !== 1) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        tenantId: memberships.tenantId,
        tenantName: tenants.name,
        createdAt: users.createdAt,
        lastLogin: users.updatedAt,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userEmail, users.email))
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .orderBy(users.createdAt);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Admin users API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
