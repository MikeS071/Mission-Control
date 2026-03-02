import * as schema from '@/db/schema';
import type { PolicyOverrides, PolicyRules } from '@/lib/policy/schema';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

type Assert<T extends true> = T;

type PoliciesSelect = typeof schema.policies.$inferSelect;
type AuditSelect = typeof schema.policyAuditLog.$inferSelect;

type _RulesTypeMatches = Assert<Equal<PoliciesSelect['rules'], PolicyRules>>;
type _OverridesTypeMatches = Assert<Equal<PoliciesSelect['customOverrides'], PolicyOverrides | null>>;
type _OldRulesTypeMatches = Assert<Equal<AuditSelect['oldRules'], PolicyRules | null>>;
type _NewRulesTypeMatches = Assert<Equal<AuditSelect['newRules'], PolicyRules | null>>;

describe('Policy DB Schema', () => {
  test('exports policy tables', () => {
    expect(schema.policies).toBeDefined();
    expect(schema.policyAuditLog).toBeDefined();
  });

  test('policies table includes required columns and constraints', () => {
    const policies = schema.policies as any;

    expect(policies.id).toBeDefined();
    expect(policies.tenantId).toBeDefined();
    expect(policies.tenantId.isUnique).toBe(true);

    expect(policies.tier.notNull).toBe(true);
    expect(policies.tier.hasDefault).toBe(true);

    expect(policies.rules.notNull).toBe(true);
    expect(policies.rules.columnType).toBe('PgJsonb');

    expect(policies.customOverrides.notNull).toBe(false);
    expect(policies.customOverrides.columnType).toBe('PgJsonb');

    expect(policies.createdAt.hasDefault).toBe(true);
    expect(policies.updatedAt.hasDefault).toBe(true);
  });

  test('policy audit log table stores nullable snapshots with timestamps', () => {
    const policyAuditLog = schema.policyAuditLog as any;

    expect(policyAuditLog.id).toBeDefined();
    expect(policyAuditLog.tenantId).toBeDefined();
    expect(policyAuditLog.changedBy).toBeDefined();

    expect(policyAuditLog.oldRules.notNull).toBe(false);
    expect(policyAuditLog.newRules.notNull).toBe(false);
    expect(policyAuditLog.oldRules.columnType).toBe('PgJsonb');
    expect(policyAuditLog.newRules.columnType).toBe('PgJsonb');

    expect(policyAuditLog.changeReason).toBeDefined();
    expect(policyAuditLog.createdAt.hasDefault).toBe(true);
  });
});
