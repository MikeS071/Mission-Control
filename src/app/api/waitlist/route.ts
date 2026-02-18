import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waitlist } from '@/db/schema';
import { sql } from 'drizzle-orm';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function GET() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);
  return NextResponse.json({ count: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { email?: string; source?: string };
  const email = body.email?.trim().toLowerCase();
  const source = body.source?.trim() || 'landing';

  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });
  }

  try {
    await db.insert(waitlist).values({ email, source });
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlist);

    return NextResponse.json({ ok: true, position: count ?? 0 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: true, alreadyJoined: true }, { status: 409 });
    }

    console.error('waitlist POST error', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
