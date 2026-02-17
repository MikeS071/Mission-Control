import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const all = await db.select().from(tasks).orderBy(tasks.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [task] = await db.insert(tasks).values(body).returning();
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  data.updatedAt = new Date();
  const [task] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(tasks).where(eq(tasks.id, id));
  return NextResponse.json({ ok: true });
}
