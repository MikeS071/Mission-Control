import fs from 'node:fs';
import path from 'node:path';

import * as schema from '@/db/schema';

function readMigration(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Usage Ledger DB Schema', () => {
  test('exports usage ledger tables', () => {
    expect(schema.usageLedger).toBeDefined();
    expect(schema.usageSummary).toBeDefined();
  });

  test('usage_ledger captures AiPipe response header values', () => {
    const usageLedger = schema.usageLedger as any;

    expect(usageLedger.tenantId.notNull).toBe(true);
    expect(usageLedger.model.notNull).toBe(true);
    expect(usageLedger.provider.notNull).toBe(true);
    expect(usageLedger.tokensIn.notNull).toBe(true);
    expect(usageLedger.tokensOut.notNull).toBe(true);
    expect(usageLedger.costUsd.notNull).toBe(true);

    expect(usageLedger.hypotheticalCostUsd.notNull).toBe(false);
    expect(usageLedger.savedUsd.notNull).toBe(false);
    expect(usageLedger.requestId.notNull).toBe(false);

    expect(usageLedger.cacheHit.hasDefault).toBe(true);
    expect(usageLedger.createdAt.hasDefault).toBe(true);
  });

  test('usage_summary has rollup counters with safe defaults', () => {
    const usageSummary = schema.usageSummary as any;

    expect(usageSummary.tenantId.notNull).toBe(true);
    expect(usageSummary.period.notNull).toBe(true);
    expect(usageSummary.periodStart.notNull).toBe(true);
    expect(usageSummary.totalTokensIn.hasDefault).toBe(true);
    expect(usageSummary.totalTokensOut.hasDefault).toBe(true);
    expect(usageSummary.totalCostUsd.hasDefault).toBe(true);
    expect(usageSummary.totalSavedUsd.hasDefault).toBe(true);
    expect(usageSummary.requestCount.hasDefault).toBe(true);
    expect(usageSummary.cacheHits.hasDefault).toBe(true);
    expect(usageSummary.updatedAt.hasDefault).toBe(true);
  });
});

describe('Usage Ledger Migration', () => {
  const drizzleMigrationPath = 'drizzle/migrations/0018_usage_ledger.sql';
  const requestedMigrationPath = 'db/migrations/0018_usage_ledger.sql';

  test('provides migration at the requested path and drizzle path', () => {
    const drizzleSql = readMigration(drizzleMigrationPath);
    const requestedSql = readMigration(requestedMigrationPath);

    expect(requestedSql).toBe(drizzleSql);
  });

  test('adds usage_ledger and usage_summary tables idempotently', () => {
    const sql = readMigration(drizzleMigrationPath);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "usage_ledger"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "usage_summary"');
  });

  test('creates required tenant/time indexes', () => {
    const sql = readMigration(drizzleMigrationPath);

    expect(sql).toContain('"usage_ledger_tenant_created_at_idx"');
    expect(sql).toContain('ON "usage_ledger" ("tenant_id", "created_at")');
    expect(sql).toContain('"usage_summary_tenant_period_start_idx"');
    expect(sql).toContain('ON "usage_summary" ("tenant_id", "period", "period_start")');
  });

  test('stores costs from AiPipe as provided values (no computed SQL formulas)', () => {
    const sql = readMigration(drizzleMigrationPath);

    expect(sql).not.toMatch(/tokens_in\s*[*\/]/i);
    expect(sql).not.toMatch(/tokens_out\s*[*\/]/i);
  });
});
