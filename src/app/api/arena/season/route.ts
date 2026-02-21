import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { arenaSeasons } from '@/db/schema';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const now = new Date();
    const [season] = await db.select().from(arenaSeasons).where(and(
      eq(arenaSeasons.tenantId, tenantId),
      eq(arenaSeasons.status, 'active'),
      lte(arenaSeasons.startsAt, now),
      gte(arenaSeasons.endsAt, now),
    )).limit(1);
    if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 });
    const xp = await db.execute(sql`
      SELECT COALESCE(SUM(reward_xp_awarded),0)::int AS total FROM arena_user_progress
      WHERE tenant_id=${tenantId} AND season_id=${season.id}
    `);
    const totalXp = Number((xp.rows[0] as { total: number }).total ?? 0);
    const totalMs = season.endsAt.getTime() - season.startsAt.getTime();
    const elapsed = Math.max(0, now.getTime() - season.startsAt.getTime());
    return NextResponse.json({
      id: season.id,
      name: season.name,
      start_at: season.startsAt,
      end_at: season.endsAt,
      days_remaining: Math.max(0, Math.ceil((season.endsAt.getTime() - now.getTime()) / 86400000)),
      total_xp_earned: totalXp,
      season_pct: totalMs > 0 ? Math.min(100, Math.round((elapsed / totalMs) * 100)) : 0,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load season' }, { status: 500 });
  }
}
