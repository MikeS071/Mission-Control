import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

type ChallengeSeed = {
  key: string; type: 'daily' | 'weekly' | 'seasonal'; title: string; description: string;
  metric: string; target: string; min: number; xp: number; difficulty: 'Easy' | 'Medium' | 'Hard'; reset: string;
};

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://openclaw@/mission_control?host=/var/run/postgresql' }));
const now = new Date();
const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const code = `S${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const challenges: ChallengeSeed[] = [
  { key: 'AD-001', type: 'daily', title: 'First Blood', description: 'Complete 1 task today.', metric: 'task_completed_count', target: '1', min: 0, xp: 15, difficulty: 'Easy', reset: 'daily_midnight_au_melbourne' },
  { key: 'AD-002', type: 'daily', title: 'Triple Strike', description: 'Complete 3 tasks today.', metric: 'task_completed_count', target: '3', min: 0, xp: 25, difficulty: 'Easy', reset: 'daily_midnight_au_melbourne' },
  { key: 'AD-003', type: 'daily', title: 'Clean Finish', description: 'Close 2 High/Critical tasks today.', metric: 'high_priority_done_count', target: '2', min: 0, xp: 22, difficulty: 'Easy', reset: 'daily_midnight_au_melbourne' },
  { key: 'AD-004', type: 'daily', title: 'Cost Guard', description: 'Keep average task cost under $0.08 with at least 3 completed tasks.', metric: 'avg_task_cost', target: '0.08', min: 3, xp: 24, difficulty: 'Easy', reset: 'daily_midnight_au_melbourne' },
  { key: 'AW-001', type: 'weekly', title: 'Seven-Day Throughput', description: 'Complete 20 tasks this week.', metric: 'task_completed_count', target: '20', min: 0, xp: 140, difficulty: 'Medium', reset: 'weekly_monday_au_melbourne' },
  { key: 'AW-002', type: 'weekly', title: 'Precision Ops', description: 'Complete 8 High/Critical tasks this week.', metric: 'high_priority_done_count', target: '8', min: 0, xp: 180, difficulty: 'Medium', reset: 'weekly_monday_au_melbourne' },
  { key: 'AW-003', type: 'weekly', title: 'Reliable Grid', description: 'Keep heartbeat success >=95% with >=100 heartbeats this week.', metric: 'heartbeat_ok_ratio', target: '0.95', min: 100, xp: 220, difficulty: 'Medium', reset: 'weekly_monday_au_melbourne' },
  { key: 'AW-004', type: 'weekly', title: 'Lean Runtime', description: 'Keep average task cost under $0.07 across at least 15 completed tasks this week.', metric: 'avg_task_cost', target: '0.07', min: 15, xp: 200, difficulty: 'Medium', reset: 'weekly_monday_au_melbourne' },
  { key: 'AS-001', type: 'seasonal', title: 'Arc Opener', description: 'Complete 60 tasks during the season.', metric: 'task_completed_count', target: '60', min: 0, xp: 1000, difficulty: 'Hard', reset: 'season_30d' },
  { key: 'AS-002', type: 'seasonal', title: 'Endurance Line', description: 'Record 20 active days in this season.', metric: 'active_days_count', target: '20', min: 0, xp: 1200, difficulty: 'Hard', reset: 'season_30d' },
  { key: 'AS-003', type: 'seasonal', title: 'Tactical Economy', description: 'Maintain average task cost under $0.07 with at least 50 completed tasks in season.', metric: 'avg_task_cost', target: '0.07', min: 50, xp: 1500, difficulty: 'Hard', reset: 'season_30d' },
  { key: 'AS-004', type: 'seasonal', title: 'Rapid Assault', description: 'Complete 40 tasks with execution time <= 60s this season.', metric: 'fast_task_count', target: '40', min: 0, xp: 1700, difficulty: 'Hard', reset: 'season_30d' },
];

async function main() {
  const tenants = await db.execute(sql`SELECT id FROM tenants ORDER BY id`);
  for (const row of tenants.rows as Array<{ id: number }>) {
    const season = await db.execute(sql`
      INSERT INTO arena_seasons (tenant_id, season_code, name, status, starts_at, ends_at)
      VALUES (${row.id}, ${code}, 'Arc I', 'active', ${now.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz)
      ON CONFLICT (tenant_id, season_code) DO UPDATE SET status='active', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at
      RETURNING id
    `);
    const seasonId = Number((season.rows[0] as { id: number }).id);
    for (const c of challenges) {
      await db.execute(sql`
        INSERT INTO arena_challenges (tenant_id, season_id, challenge_key, challenge_type, title, description, metric_key, operator, target_value, min_sample_size, reward_xp, difficulty, active, reset_rule, starts_at, ends_at)
        VALUES (${row.id}, ${seasonId}, ${c.key}, ${c.type}, ${c.title}, ${c.description}, ${c.metric}, 'gte', ${c.target}::numeric, ${c.min}, ${c.xp}, ${c.difficulty}, true, ${c.reset}, ${now.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz)
        ON CONFLICT (tenant_id, challenge_key, season_id) DO UPDATE SET
        challenge_type=EXCLUDED.challenge_type, title=EXCLUDED.title, description=EXCLUDED.description, metric_key=EXCLUDED.metric_key,
        target_value=EXCLUDED.target_value, min_sample_size=EXCLUDED.min_sample_size, reward_xp=EXCLUDED.reward_xp, difficulty=EXCLUDED.difficulty,
        active=true, reset_rule=EXCLUDED.reset_rule, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at, updated_at=NOW()
      `);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  process.stderr.write(`seed-arena failed: ${e instanceof Error ? e.message : 'unknown'}\n`);
  process.exit(1);
});
