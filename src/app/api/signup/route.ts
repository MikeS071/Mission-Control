import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memberships, tenants, users } from '@/db/schema';
import { parseBody, SignupSchema } from '@/lib/validate';

type DbSelector = Pick<typeof db, 'select'>;

const planToBilling: Record<'initiate' | 'strategos' | 'archon', 'free' | 'pro' | 'team'> = {
  initiate: 'free',
  strategos: 'pro',
  archon: 'team',
};

class SignupError extends Error {
  constructor(public code: 'ACCOUNT_EXISTS') {
    super(code);
  }
}

async function generateUniqueSlug(baseName: string, executor: DbSelector): Promise<string> {
  const base = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';
  let candidate = base;
  let attempt = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await executor
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(SignupSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  const { email, password, workspaceName, plan } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const billingPlan = planToBilling[plan];

  try {
    const { tenantId } = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);
      if (existing) throw new SignupError('ACCOUNT_EXISTS');

      const passwordHash = await bcrypt.hash(password, 12);
      const slug = await generateUniqueSlug(workspaceName, tx);
      const displayName = normalizedEmail.split('@')[0];

      const [newUser] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          name: displayName,
        })
        .returning();

      const [tenant] = await tx
        .insert(tenants)
        .values({
          slug,
          name: workspaceName.trim(),
          plan: 'free',
          ownerUserId: newUser.id,
        })
        .returning();

      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userEmail: normalizedEmail,
        role: 'owner',
      });

      return { tenantId: tenant.id };
    });

    return NextResponse.json({ ok: true, tenantId, plan, billingPlan });
  } catch (error) {
    if (error instanceof SignupError && error.code === 'ACCOUNT_EXISTS') {
      return NextResponse.json({ error: 'An account already exists for that email.' }, { status: 409 });
    }
    console.error('[signup] failed to create account', error);
    return NextResponse.json({ error: 'Failed to create your workspace. Please try again.' }, { status: 500 });
  }
}
