import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { featureRequests } from '@/db/schema';
import { parseBody, FeatureRequestSchema } from '@/lib/validate';
import { resolveTenantId } from '@/lib/tenant';

export async function POST(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(FeatureRequestSchema, await req.json());
  if (!parsed.ok) return parsed.response;
  const { email, description } = parsed.data;

  await db.insert(featureRequests).values({
    email: email.trim().toLowerCase(),
    description,
    status: 'pending',
  });

  return NextResponse.json({ ok: true });
}
