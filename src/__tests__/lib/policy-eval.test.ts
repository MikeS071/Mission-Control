import {
  checkLimit,
  FEATURE_KEYS,
  getEffectiveRules,
  isFeatureEnabled,
  type FeatureKey,
  type Policy,
} from '@/lib/policy/eval';

describe('policy eval helpers', () => {
  const allFeatures = [...FEATURE_KEYS] as FeatureKey[];

  it('getEffectiveRules returns exactly one rule per feature key', () => {
    const policy: Policy = { tier: 'initiate' };

    const rules = getEffectiveRules(policy);

    expect(rules).toHaveLength(allFeatures.length);
    expect(rules.map((rule) => rule.feature).sort()).toEqual([...allFeatures].sort());
  });

  it('getEffectiveRules merges tier defaults with custom overrides', () => {
    const policy: Policy = {
      tier: 'initiate',
      customOverrides: [
        { feature: 'arena', enabled: true, limit: 3 },
        { feature: 'agents', enabled: true, limit: 'unlimited' },
      ],
    };

    const rules = getEffectiveRules(policy);
    const arenaRule = rules.find((rule) => rule.feature === 'arena');
    const agentsRule = rules.find((rule) => rule.feature === 'agents');
    const chatRule = rules.find((rule) => rule.feature === 'chat');

    expect(arenaRule).toEqual({ feature: 'arena', enabled: true, limit: 3 });
    expect(agentsRule).toEqual({ feature: 'agents', enabled: true, limit: 'unlimited' });
    expect(chatRule).toBeDefined();
  });

  it('isFeatureEnabled handles all feature keys via effective rules', () => {
    const policy: Policy = {
      tier: 'initiate',
      customOverrides: allFeatures.map((feature) => ({ feature, enabled: true, limit: 'unlimited' })),
    };

    for (const feature of allFeatures) {
      expect(isFeatureEnabled(policy, feature)).toBe(true);
    }
  });

  it('checkLimit enforces numeric limits', () => {
    const policy: Policy = {
      tier: 'initiate',
      customOverrides: [{ feature: 'arena', enabled: true, limit: 2 }],
    };

    expect(checkLimit(policy, 'arena', 0)).toEqual({ allowed: true, limit: 2, remaining: 2 });
    expect(checkLimit(policy, 'arena', 1)).toEqual({ allowed: true, limit: 2, remaining: 1 });
    expect(checkLimit(policy, 'arena', 2)).toEqual({ allowed: false, limit: 2, remaining: 0 });
    expect(checkLimit(policy, 'arena', 9)).toEqual({ allowed: false, limit: 2, remaining: 0 });
  });

  it('checkLimit always allows unlimited limits', () => {
    const policy: Policy = {
      tier: 'initiate',
      customOverrides: [{ feature: 'chat', enabled: true, limit: 'unlimited' }],
    };

    expect(checkLimit(policy, 'chat', 0)).toEqual({ allowed: true, limit: 'unlimited', remaining: 'unlimited' });
    expect(checkLimit(policy, 'chat', 10_000)).toEqual({ allowed: true, limit: 'unlimited', remaining: 'unlimited' });
  });

  it('defaults to denied when rules are missing', () => {
    const unknownTierPolicy = { tier: 'unknown' } as Policy;

    for (const feature of allFeatures) {
      expect(isFeatureEnabled(unknownTierPolicy, feature)).toBe(false);
      expect(checkLimit(unknownTierPolicy, feature, 0)).toEqual({
        allowed: false,
        limit: 0,
        remaining: 0,
      });
    }
  });

  it('denies disabled features regardless of numeric limit value', () => {
    const policy: Policy = {
      tier: 'strategos',
      customOverrides: [{ feature: 'aipipe', enabled: false, limit: 1000 }],
    };

    expect(isFeatureEnabled(policy, 'aipipe')).toBe(false);
    expect(checkLimit(policy, 'aipipe', 0)).toEqual({ allowed: false, limit: 1000, remaining: 1000 });
  });
});
