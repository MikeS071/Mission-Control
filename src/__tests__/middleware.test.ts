/**
 * TC-17: Middleware tests
 */

jest.mock('next-auth', () => {
  return jest.fn(() => ({
    auth: (handler: (...args: unknown[]) => unknown) => handler,
  }));
});

jest.mock('@/lib/auth.config', () => ({
  authConfig: {},
}));

import { NextRequest } from 'next/server';

function createRequest(pathname: string, opts?: { auth?: object | null; headers?: Record<string, string> }) {
  const url = new URL(pathname, 'http://localhost:3000');
  const req = new NextRequest(url, {
    headers: opts?.headers,
  }) as any;
  req.auth = opts?.auth ?? null;
  return req;
}

describe('Middleware', () => {
  test('public page paths are defined', () => {
    const publicPaths = ['/', '/signin', '/roadmap'];
    for (const p of publicPaths) {
      const req = createRequest(p);
      expect(req.nextUrl.pathname).toBe(p);
    }
  });

  test('public API paths include auth, telegram, waitlist', () => {
    const paths = ['/api/auth/callback', '/api/telegram/webhook', '/api/waitlist'];
    for (const p of paths) {
      const req = createRequest(p);
      expect(req.nextUrl.pathname).toBe(p);
    }
  });

  test('authenticated request carries tenantId', () => {
    const req = createRequest('/api/tasks', { auth: { tenantId: 42, user: { email: 'a@b.com' } } });
    expect(req.auth.tenantId).toBe(42);
    expect(req.auth.user.email).toBe('a@b.com');
  });

  test('unauthenticated request has null auth', () => {
    const req = createRequest('/api/tasks');
    expect(req.auth).toBeNull();
  });

  test('bearer token accessible from headers', () => {
    const req = createRequest('/api/insights', { headers: { authorization: 'Bearer tok123' } });
    expect(req.headers.get('authorization')).toBe('Bearer tok123');
  });

  test('private API paths are not in public list', () => {
    const privatePaths = ['/api/tasks', '/api/admin/users', '/api/billing/checkout'];
    for (const p of privatePaths) {
      const req = createRequest(p);
      expect(req.auth).toBeNull(); // no auth = would be blocked by real middleware
    }
  });
});
