import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config'; // edge-safe — no DB imports
import { NextResponse } from 'next/server';
import type { NextAuthRequest } from 'next-auth';

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = [
  '/',
  '/signin',
  '/roadmap',
  '/api/auth',
  '/api/telegram',
  '/api/waitlist',
  '/api/feature-requests',
  '/api/newsletter/unsubscribe',
  '/unsubscribe',
];

export default auth((req: NextAuthRequest) => {
  const { pathname } = req.nextUrl;

  // Allow public paths through
  if (!pathname.startsWith('/api/') || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Session-authenticated — inject tenantId + email headers for API routes
  const tenantId = req.auth?.tenantId;
  const userEmail = req.auth?.user?.email;
  if (req.auth) {
    const headers = new Headers(req.headers);
    if (tenantId) headers.set('x-tenant-id', String(tenantId));
    if (userEmail) headers.set('x-user-email', userEmail);
    return NextResponse.next({ request: { headers } });
  }

  // Bearer token (automation scripts) — token validation happens in route runtime
  // because env resolution in proxy/edge can be unreliable.
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
});

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
