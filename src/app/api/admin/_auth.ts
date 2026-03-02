import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';

type AdminAuthResult =
  | { session: Session }
  | { response: NextResponse };

export async function requireAdmin(): Promise<AdminAuthResult> {
  const session = await auth();

  if (!session?.user?.email) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (!session.user.isAdmin) {
    return { response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { session };
}
