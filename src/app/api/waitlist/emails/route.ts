import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { waitlist } from '@/db/schema';
import { asc } from 'drizzle-orm';

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const expected = process.env.API_SECRET;

  if (!expected) return false;
  if (!authHeader.startsWith('Bearer ')) return false;

  const token = authHeader.slice('Bearer '.length).trim();
  return token === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt));

  const emails = rows.map((row) => row.email);

  return NextResponse.json({ emails, count: emails.length });
}
