import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { challenges } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';

type ChallengeInput = {
  title?: string;
  description?: string;
  xpReward?: number;
  dueDate?: string;
};

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(challenges)
    .where(eq(challenges.tenantId, tenantId))
    .orderBy(desc(challenges.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as ChallengeInput;
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const [challenge] = await db
    .insert(challenges)
    .values({
      tenantId,
      title,
      description: body.description ?? '',
      xpReward: Number.isFinite(body.xpReward) ? Number(body.xpReward) : 50,
      dueDate: body.dueDate ?? null,
      status: 'active',
    })
    .returning();

  return NextResponse.json(challenge, { status: 201 });
}
