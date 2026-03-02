import { getDefaultPolicy, TIER_NAMES } from '@/lib/policy/templates';
import { PolicyTierSchema } from '@/lib/policy/schema';

describe('policy templates', () => {
  it('exports supported tier names', () => {
    expect(TIER_NAMES).toEqual(['free', 'pro', 'enterprise']);
  });

  it('returns expected default rules for free tier', () => {
    const free = getDefaultPolicy('free');

    expect(free).toEqual({
      name: 'free',
      rules: [
        { featureKey: 'agents', limitType: 'number', limitValue: 1, enabled: true },
        { featureKey: 'models', limitType: 'number', limitValue: 3, enabled: true },
        { featureKey: 'storage_mb', limitType: 'number', limitValue: 100, enabled: true },
        { featureKey: 'api_calls_per_day', limitType: 'number', limitValue: 100, enabled: true },
        { featureKey: 'custom_tools', limitType: 'boolean', limitValue: false, enabled: false },
        { featureKey: 'team_members', limitType: 'number', limitValue: 1, enabled: true },
      ],
    });
  });

  it('returns expected default rules for pro tier', () => {
    const pro = getDefaultPolicy('pro');

    expect(pro).toEqual({
      name: 'pro',
      rules: [
        { featureKey: 'agents', limitType: 'number', limitValue: 5, enabled: true },
        { featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'storage_mb', limitType: 'number', limitValue: 5120, enabled: true },
        { featureKey: 'api_calls_per_day', limitType: 'number', limitValue: 10000, enabled: true },
        { featureKey: 'custom_tools', limitType: 'boolean', limitValue: true, enabled: true },
        { featureKey: 'team_members', limitType: 'number', limitValue: 10, enabled: true },
      ],
    });
  });

  it('returns expected default rules for enterprise tier', () => {
    const enterprise = getDefaultPolicy('enterprise');

    expect(enterprise).toEqual({
      name: 'enterprise',
      rules: [
        { featureKey: 'agents', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'storage_mb', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'api_calls_per_day', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'custom_tools', limitType: 'unlimited', limitValue: null, enabled: true },
        { featureKey: 'team_members', limitType: 'unlimited', limitValue: null, enabled: true },
      ],
    });
  });

  it('rejects unsupported tier names', () => {
    expect(() => getDefaultPolicy('startup')).toThrow('Unknown policy tier: startup');
  });

  it('returns schema-valid templates for every tier', () => {
    for (const tierName of TIER_NAMES) {
      const policy = getDefaultPolicy(tierName);
      const parsed = PolicyTierSchema.safeParse(policy);
      expect(parsed.success).toBe(true);
    }
  });

  it('returns a copy so mutations do not affect future calls', () => {
    const first = getDefaultPolicy('free');
    first.rules[0].limitValue = 999;

    const second = getDefaultPolicy('free');
    expect(second.rules[0].limitValue).toBe(1);
  });
});
