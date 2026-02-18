import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (source)
      id,
      source,
      status,
      payload,
      checked_at AS "checkedAt"
    FROM heartbeats
    ORDER BY source, checked_at DESC
  `);

  return NextResponse.json(rows.rows);
}
