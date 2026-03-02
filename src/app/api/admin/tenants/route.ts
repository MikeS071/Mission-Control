import { NextRequest, NextResponse } from 'next/server';
import { tenants } from '@/db/schema';
import { db } from '@/lib/db';
import { requireAdmin } from '@/app/api/admin/_auth';

export async function GET(_req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  const rows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      plan: tenants.plan,
      createdAt: tenants.createdAt,
    })
    .from(tenants);

  return NextResponse.json({ tenants: rows });
}
