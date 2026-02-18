import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { featureRequests } from '@/db/schema';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; description?: string };
  const email = body.email?.trim().toLowerCase();
  const description = body.description?.trim();

  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ ok: false, error: 'Description is required' }, { status: 400 });
  }

  await db.insert(featureRequests).values({
    email,
    description,
    status: 'pending',
  });

  return NextResponse.json({ ok: true });
}
