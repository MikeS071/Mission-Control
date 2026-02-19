import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Edge-compatible auth config — no DB imports.
 * Used by middleware (edge runtime).
 * The jwt callback here only passes through; tenant lookup happens in auth.ts (Node.js).
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    jwt({ token }) {
      // tenantId is already set during sign-in (see auth.ts); just pass through
      return token;
    },
    session({ session, token }) {
      if (typeof token.tenantId === 'number') {
        session.tenantId = token.tenantId;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) return url;
      } catch {
        // ignore malformed URLs
      }
      return `${baseUrl}/dashboard`;
    },
  },
};
