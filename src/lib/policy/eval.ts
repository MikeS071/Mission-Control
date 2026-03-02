export const FEATURE_KEYS = [
  'browser',
  'nodes',
  'social',
  'arena',
  'chat',
  'aipipe',
  'agents',
  'contentai',
  'coderai',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type PolicyTier = 'initiate' | 'strategos' | 'archon' | string;
export type PolicyLimit = number | 'unlimited';

export interface PolicyRule {
  feature: FeatureKey;
  enabled: boolean;
  limit: PolicyLimit;
}

export interface Policy {
  tier: PolicyTier;
  customOverrides?: PolicyRule[];
  overrides?: PolicyRule[];
}

const DENY_BY_DEFAULT_RULES: Readonly<Record<FeatureKey, PolicyRule>> = {
  browser: { feature: 'browser', enabled: false, limit: 0 },
  nodes: { feature: 'nodes', enabled: false, limit: 0 },
  social: { feature: 'social', enabled: false, limit: 0 },
  arena: { feature: 'arena', enabled: false, limit: 0 },
  chat: { feature: 'chat', enabled: false, limit: 0 },
  aipipe: { feature: 'aipipe', enabled: false, limit: 0 },
  agents: { feature: 'agents', enabled: false, limit: 0 },
  contentai: { feature: 'contentai', enabled: false, limit: 0 },
  coderai: { feature: 'coderai', enabled: false, limit: 0 },
};

const TIER_DEFAULT_RULES: Readonly<Record<'initiate' | 'strategos' | 'archon', Readonly<Record<FeatureKey, PolicyRule>>>> = {
  initiate: {
    browser: { feature: 'browser', enabled: true, limit: 'unlimited' },
    nodes: { feature: 'nodes', enabled: true, limit: 10 },
    social: { feature: 'social', enabled: false, limit: 0 },
    arena: { feature: 'arena', enabled: false, limit: 0 },
    chat: { feature: 'chat', enabled: true, limit: 2_000 },
    aipipe: { feature: 'aipipe', enabled: false, limit: 0 },
    agents: { feature: 'agents', enabled: true, limit: 1 },
    contentai: { feature: 'contentai', enabled: false, limit: 0 },
    coderai: { feature: 'coderai', enabled: false, limit: 0 },
  },
  strategos: {
    browser: { feature: 'browser', enabled: true, limit: 'unlimited' },
    nodes: { feature: 'nodes', enabled: true, limit: 250 },
    social: { feature: 'social', enabled: true, limit: 50 },
    arena: { feature: 'arena', enabled: true, limit: 20 },
    chat: { feature: 'chat', enabled: true, limit: 'unlimited' },
    aipipe: { feature: 'aipipe', enabled: true, limit: 100_000 },
    agents: { feature: 'agents', enabled: true, limit: 5 },
    contentai: { feature: 'contentai', enabled: true, limit: 100 },
    coderai: { feature: 'coderai', enabled: true, limit: 100 },
  },
  archon: {
    browser: { feature: 'browser', enabled: true, limit: 'unlimited' },
    nodes: { feature: 'nodes', enabled: true, limit: 'unlimited' },
    social: { feature: 'social', enabled: true, limit: 'unlimited' },
    arena: { feature: 'arena', enabled: true, limit: 'unlimited' },
    chat: { feature: 'chat', enabled: true, limit: 'unlimited' },
    aipipe: { feature: 'aipipe', enabled: true, limit: 'unlimited' },
    agents: { feature: 'agents', enabled: true, limit: 'unlimited' },
    contentai: { feature: 'contentai', enabled: true, limit: 'unlimited' },
    coderai: { feature: 'coderai', enabled: true, limit: 'unlimited' },
  },
};

function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && FEATURE_KEYS.includes(value as FeatureKey);
}

function isKnownTier(value: PolicyTier): value is 'initiate' | 'strategos' | 'archon' {
  return value === 'initiate' || value === 'strategos' || value === 'archon';
}

function cloneRule(rule: PolicyRule): PolicyRule {
  return { feature: rule.feature, enabled: rule.enabled, limit: rule.limit };
}

function normalizeRule(rule: PolicyRule): PolicyRule {
  if (rule.limit === 'unlimited') {
    return cloneRule(rule);
  }

  const nextLimit = Number.isFinite(rule.limit) ? Math.max(0, Math.floor(rule.limit)) : 0;
  return {
    feature: rule.feature,
    enabled: Boolean(rule.enabled),
    limit: nextLimit,
  };
}

function getOverrideRules(policy: Policy): PolicyRule[] {
  const combined = [...(policy.customOverrides ?? []), ...(policy.overrides ?? [])];
  return combined.filter((rule) => isFeatureKey(rule.feature)).map(normalizeRule);
}

function getTierRules(tier: PolicyTier): PolicyRule[] {
  if (!isKnownTier(tier)) {
    return [];
  }

  return FEATURE_KEYS.map((feature) => cloneRule(TIER_DEFAULT_RULES[tier][feature]));
}

function deniedRule(feature: FeatureKey): PolicyRule {
  return cloneRule(DENY_BY_DEFAULT_RULES[feature]);
}

function getRuleForFeature(policy: Policy, feature: FeatureKey): PolicyRule {
  const rules = getEffectiveRules(policy);
  return rules.find((rule) => rule.feature === feature) ?? deniedRule(feature);
}

export function getEffectiveRules(policy: Policy): PolicyRule[] {
  const merged = new Map<FeatureKey, PolicyRule>();

  for (const baseRule of getTierRules(policy.tier)) {
    merged.set(baseRule.feature, normalizeRule(baseRule));
  }

  for (const overrideRule of getOverrideRules(policy)) {
    merged.set(overrideRule.feature, normalizeRule(overrideRule));
  }

  return FEATURE_KEYS.map((feature) => {
    const rule = merged.get(feature);
    return rule ? cloneRule(rule) : deniedRule(feature);
  });
}

export function isFeatureEnabled(policy: Policy, feature: FeatureKey): boolean {
  return getRuleForFeature(policy, feature).enabled;
}

export function checkLimit(
  policy: Policy,
  feature: FeatureKey,
  currentUsage: number,
): {
  allowed: boolean;
  limit: number | 'unlimited';
  remaining: number | 'unlimited';
} {
  const rule = getRuleForFeature(policy, feature);

  if (rule.limit === 'unlimited') {
    return {
      allowed: rule.enabled,
      limit: 'unlimited',
      remaining: 'unlimited',
    };
  }

  const safeUsage = Number.isFinite(currentUsage) ? Math.max(0, Math.floor(currentUsage)) : 0;
  const remaining = Math.max(rule.limit - safeUsage, 0);
  if (!rule.enabled) {
    return {
      allowed: false,
      limit: rule.limit,
      remaining,
    };
  }

  return {
    allowed: safeUsage < rule.limit,
    limit: rule.limit,
    remaining,
  };
}
