import NextAuth from 'next-auth';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships, tenants } from '@/db/schema';
import { authConfig } from './auth.config';

/**
 * Full auth config with DB access — Node.js runtime only.
 * Used in API routes and server components.
 */
export const { auth, handlers } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Only do DB work on sign-in (user is present)
      if (user?.email) {
        const [existing] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.userEmail, user.email))
          .limit(1);

        if (existing) {
          token.tenantId = existing.tenantId;
        } else {
          // Auto-provision personal tenant for new users
          const base = user.email
            .split('@')[0]
            .replace(/[^a-z0-9]/gi, '-')
            .toLowerCase();
          const slug = `${base}-${Date.now().toString(36)}`;
          const [tenant] = await db
            .insert(tenants)
            .values({ slug, name: user.name ?? base, plan: 'free' })
            .returning();
          await db.insert(memberships).values({
            tenantId: tenant.id,
            userEmail: user.email,
            role: 'owner',
          });
          token.tenantId = tenant.id;
        }
      }
      return token;
    },
  },
});
