import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await db.execute(sql`
      WITH season AS (
        SELECT id FROM arena_seasons
        WHERE tenant_id=${tenantId} AND status='active' AND starts_at<=NOW() AND ends_at>=NOW()
        ORDER BY starts_at DESC LIMIT 1
      )
      SELECT c.id, c.challenge_type AS type, c.title, c.description, c.reward_xp, c.difficulty,
        COALESCE(p.current_value, 0) AS current_value, COALESCE(p.target_value, c.target_value) AS target_value,
        COALESCE(p.status, 'active') AS status,
        LEAST(100, GREATEST(0, ROUND((COALESCE(p.current_value,0) / NULLIF(COALESCE(p.target_value,c.target_value),0)) * 100, 2))) AS completion_pct
      FROM arena_challenges c
      LEFT JOIN season s ON true
      LEFT JOIN arena_user_progress p
        ON p.challenge_id=c.id AND p.tenant_id=${tenantId} AND p.season_id=s.id
      WHERE c.tenant_id=${tenantId} AND c.active=true
      ORDER BY CASE c.challenge_type WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 ELSE 3 END, c.id
    `);
    const rows = result.rows as Array<Record<string, unknown>>;
    return NextResponse.json({
      daily: rows.filter((r) => r.type === 'daily'),
      weekly: rows.filter((r) => r.type === 'weekly'),
      seasonal: rows.filter((r) => r.type === 'seasonal'),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load challenges' }, { status: 500 });
  }
}
