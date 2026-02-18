import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/api/auth', '/api/telegram', '/', '/signin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith('/api/') || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionToken = req.cookies.get('__Secure-next-auth.session-token') || req.cookies.get('next-auth.session-token');
  if (sessionToken) return NextResponse.next();

  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token && token === process.env.API_SECRET) return NextResponse.next();

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export const config = {
  matcher: ['/api/:path*'],
};
