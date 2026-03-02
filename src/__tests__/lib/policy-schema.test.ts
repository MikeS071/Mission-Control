import {
  PolicyRuleSchema,
  PolicyTierSchema,
  PolicySchema,
  validatePolicy,
  validateRule,
} from '@/lib/policy/schema';

describe('policy schema', () => {
  describe('validateRule', () => {
    it('accepts valid number, boolean, and unlimited rule variants', () => {
      const numberRule = validateRule({
        featureKey: 'storage_mb',
        limitType: 'number',
        limitValue: 1024,
        enabled: true,
      });
      const booleanRule = validateRule({
        featureKey: 'custom_tools',
        limitType: 'boolean',
        limitValue: true,
        enabled: true,
      });
      const unlimitedRule = validateRule({
        featureKey: 'api_calls_per_day',
        limitType: 'unlimited',
        limitValue: null,
        enabled: true,
      });

      expect(numberRule.success).toBe(true);
      expect(booleanRule.success).toBe(true);
      expect(unlimitedRule.success).toBe(true);
    });

    it('rejects rules with unknown feature keys', () => {
      const result = validateRule({
        featureKey: 'seats',
        limitType: 'number',
        limitValue: 10,
        enabled: true,
      });

      expect(result.success).toBe(false);
    });

    it('rejects mismatched limitType and limitValue', () => {
      const result = validateRule({
        featureKey: 'agents',
        limitType: 'boolean',
        limitValue: 2,
        enabled: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('limitValue');
      }
    });
  });

  describe('PolicyTierSchema', () => {
    it('accepts a tier with a supported name and rule list', () => {
      const result = PolicyTierSchema.safeParse({
        name: 'pro',
        rules: [
          {
            featureKey: 'agents',
            limitType: 'number',
            limitValue: 5,
            enabled: true,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('rejects unknown tier names', () => {
      const result = PolicyTierSchema.safeParse({
        name: 'startup',
        rules: [],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('validatePolicy', () => {
    it('accepts a complete policy document', () => {
      const result = validatePolicy({
        tenantId: 42,
        tier: 'pro',
        customOverrides: [
          {
            featureKey: 'team_members',
            limitType: 'number',
            limitValue: 15,
            enabled: true,
          },
        ],
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      });

      expect(result.success).toBe(true);
    });

    it('rejects policies with invalid timestamps', () => {
      const result = validatePolicy({
        tenantId: 42,
        tier: 'free',
        customOverrides: [],
        createdAt: 'not-a-date',
        updatedAt: '2026-03-02T00:00:00.000Z',
      });

      expect(result.success).toBe(false);
    });

    it('rejects policies with non-positive tenant IDs', () => {
      const result = validatePolicy({
        tenantId: 0,
        tier: 'free',
        customOverrides: [],
        createdAt: '2026-03-02T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('schema exports', () => {
    it('PolicyRuleSchema and PolicySchema parse expected payloads directly', () => {
      expect(() =>
        PolicyRuleSchema.parse({
          featureKey: 'models',
          limitType: 'number',
          limitValue: 3,
          enabled: true,
        }),
      ).not.toThrow();

      expect(() =>
        PolicySchema.parse({
          tenantId: 7,
          tier: 'enterprise',
          customOverrides: [],
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        }),
      ).not.toThrow();
    });
  });
});
