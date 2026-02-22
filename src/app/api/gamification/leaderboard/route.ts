import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, xpLedger } from '@/db/schema';

type LeaderboardRow = {
  id: number;
  slug: string;
  totalXp: number;
};

export async function GET() {
  const result = await db.execute(sql<LeaderboardRow>`
    select t.id, t.slug, coalesce(sum(x.points), 0)::int as "totalXp"
    from ${tenants} t
    left join ${xpLedger} x on t.id = x.tenant_id
    group by t.id, t.slug
    order by "totalXp" desc, t.slug asc
    limit 10
  `);

  const rows = result.rows.map((row) => {
    const totalXp = Number(row.totalXp ?? 0);
    return {
      tenantId: Number(row.id),
      tenantSlug: row.slug,
      totalXp,
      level: Math.floor(totalXp / 100) + 1,
    };
  });

  return NextResponse.json(rows);
}
