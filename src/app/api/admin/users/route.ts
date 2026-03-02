import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '@/db/schema';
import { db } from '@/lib/db';
import { requireAdmin } from '@/app/api/admin/_auth';

const UpdateUserSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: 'At least one update field is required',
  });

export async function GET(_req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users);

  return NextResponse.json({ users: allUsers });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const body = await req.json();
    const parsed = UpdateUserSchema.parse(body);

    const [updated] = await db
      .update(users)
      .set({
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
