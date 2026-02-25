import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const tables = ['tasks', 'tenants', 'users', 'memberships', 'events'] as const;

  for (const t of tables) {
    const res = await client.query<{ reg: string | null }>('SELECT to_regclass($1) as reg', [`public.${t}`]);
    const reg = res.rows?.[0]?.reg;
    if (reg !== t) {
      console.error(`[integration] missing table: ${t}`);
      process.exit(1);
    }
  }

  await client.end();
  console.log('[integration] tables present');
}

void main();
