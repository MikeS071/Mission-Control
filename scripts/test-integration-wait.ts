import { Client } from 'pg';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
    process.exit(2);
  }

  const deadline = Date.now() + 60_000;
  let lastErr: unknown = null;

  while (Date.now() < deadline) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log('[integration] postgres ready');
      return;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        // ignore
      }
      await sleep(1500);
    }
  }

  console.error('[integration] postgres not ready after 60s');
  if (lastErr) console.error(lastErr);
  process.exit(1);
}

void main();
