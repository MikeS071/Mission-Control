import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships, tenants, users } from '@/db/schema';
import { authConfig } from './auth.config';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const credentialsProvider = Credentials({
  name: 'Email login',
  credentials: {
    email: { label: 'Email', type: 'email' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials) {
    const email = typeof credentials?.email === 'string' ? normalizeEmail(credentials.email) : '';
    const password = typeof credentials?.password === 'string' ? credentials.password : '';
    if (!email || !password) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user?.passwordHash) return null;
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    return {
      id: String(user.id),
      email: user.email,
      name: user.name ?? undefined,
    };
  },
});

const providers = [...(authConfig.providers ?? []), credentialsProvider];

/**
 * Full auth config with DB access — Node.js runtime only.
 * Used in API routes and server components.
 */
export const { auth, handlers } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (!user?.email) return token;

      const email = normalizeEmail(user.email);
      const displayName = user.name ?? email.split('@')[0];

      let [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!dbUser) {
        const [created] = await db
          .insert(users)
          .values({ email, name: user.name ?? null })
          .returning();
        dbUser = created;
      } else if (user.name && dbUser.name !== user.name) {
        await db
          .update(users)
          .set({ name: user.name, updatedAt: new Date() })
          .where(eq(users.id, dbUser.id));
      }

      const [existingMembership] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userEmail, email))
        .limit(1);

      if (existingMembership) {
        token.tenantId = existingMembership.tenantId;
        return token;
      }

      const baseSlug = email
        .split('@')[0]
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'workspace';
      const slug = `${baseSlug}-${Date.now().toString(36)}`;

      const [tenant] = await db
        .insert(tenants)
        .values({ slug, name: displayName, plan: 'free', ownerUserId: dbUser.id })
        .returning();

      await db.insert(memberships).values({
        tenantId: tenant.id,
        userEmail: email,
        role: 'owner',
      });
      token.tenantId = tenant.id;
      return token;
    },
  },
});
