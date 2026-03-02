import {
  POLICY_FEATURE_KEYS,
  PolicyTierNameSchema,
  PolicyTierSchema,
  type PolicyRule,
  type PolicyRules,
  type PolicyTemplate,
  type PolicyTier,
} from '@/lib/policy/schema';

export const TIER_NAMES = ['free', 'pro', 'team'] as const;

const DEFAULT_POLICY_TEMPLATES: Record<PolicyTier, PolicyTemplate> = {
  free: {
    name: 'free',
    rules: [
      { featureKey: 'agents', limitType: 'number', limitValue: 1, enabled: true },
      { featureKey: 'models', limitType: 'number', limitValue: 3, enabled: true },
      { featureKey: 'storage_mb', limitType: 'number', limitValue: 100, enabled: true },
      { featureKey: 'api_calls_per_day', limitType: 'number', limitValue: 100, enabled: true },
      { featureKey: 'custom_tools', limitType: 'boolean', limitValue: false, enabled: false },
      { featureKey: 'team_members', limitType: 'number', limitValue: 1, enabled: true },
    ],
  },
  pro: {
    name: 'pro',
    rules: [
      { featureKey: 'agents', limitType: 'number', limitValue: 5, enabled: true },
      { featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'storage_mb', limitType: 'number', limitValue: 5120, enabled: true },
      { featureKey: 'api_calls_per_day', limitType: 'number', limitValue: 10000, enabled: true },
      { featureKey: 'custom_tools', limitType: 'boolean', limitValue: true, enabled: true },
      { featureKey: 'team_members', limitType: 'number', limitValue: 10, enabled: true },
    ],
  },
  team: {
    name: 'team',
    rules: [
      { featureKey: 'agents', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'models', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'storage_mb', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'api_calls_per_day', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'custom_tools', limitType: 'unlimited', limitValue: null, enabled: true },
      { featureKey: 'team_members', limitType: 'unlimited', limitValue: null, enabled: true },
    ],
  },
};

export function getDefaultPolicy(tierName: string): PolicyTemplate {
  const parsedTier = PolicyTierNameSchema.safeParse(tierName);
  if (!parsedTier.success) {
    throw new Error(`Unknown policy tier: ${tierName}`);
  }

  const template = DEFAULT_POLICY_TEMPLATES[parsedTier.data];
  return PolicyTierSchema.parse({
    name: template.name,
    rules: template.rules.map((rule) => ({ ...rule })),
  });
}

export function coercePolicyTier(input: unknown): PolicyTier {
  const parsed = PolicyTierNameSchema.safeParse(input);
  return parsed.success ? parsed.data : 'free';
}

export function applyPolicyOverrides(baseRules: PolicyRules, overrides: PolicyRules): PolicyRules {
  const merged = new Map<PolicyRule['featureKey'], PolicyRule>();
  for (const base of baseRules) {
    merged.set(base.featureKey, { ...base });
  }
  for (const override of overrides) {
    merged.set(override.featureKey, { ...override });
  }

  return POLICY_FEATURE_KEYS.flatMap((featureKey) => {
    const rule = merged.get(featureKey);
    return rule ? [{ ...rule }] : [];
  });
}

