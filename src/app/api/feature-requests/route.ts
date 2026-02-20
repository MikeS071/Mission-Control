import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { featureRequests } from '@/db/schema';
import { parseBody, FeatureRequestSchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
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
