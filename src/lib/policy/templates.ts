import { PolicyTierNameSchema, PolicyTierSchema, type PolicyTier } from '@/lib/policy/schema';

export const TIER_NAMES = ['free', 'pro', 'enterprise'] as const;

type TierName = (typeof TIER_NAMES)[number];

type Policy = PolicyTier;

const DEFAULT_POLICY_TEMPLATES: Record<TierName, Policy> = {
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
  enterprise: {
    name: 'enterprise',
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

export function getDefaultPolicy(tierName: string): Policy {
  const parsedTier = PolicyTierNameSchema.safeParse(tierName);
  if (!parsedTier.success) {
    throw new Error(`Unknown policy tier: ${tierName}`);
  }

  const template = DEFAULT_POLICY_TEMPLATES[parsedTier.data];
  const copy: Policy = {
    name: template.name,
    rules: template.rules.map((rule) => ({ ...rule })),
  };

  return PolicyTierSchema.parse(copy);
}
