import { PolicyRulesSchema, type PolicyRules, type PolicyTier } from '@/lib/policy/schema';
import { applyPolicyOverrides, coercePolicyTier, getDefaultPolicy } from '@/lib/policy/templates';

export interface TenantPolicyRow {
  tenantId: number;
  tenantName: string;
  tenantPlan: string | null;
  tier: string | null;
  rules: unknown;
  customOverrides: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function parseRules(input: unknown): PolicyRules | null {
  const parsed = PolicyRulesSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function resolveTier(row: Pick<TenantPolicyRow, 'tier' | 'tenantPlan'>): PolicyTier {
  return coercePolicyTier(row.tier ?? row.tenantPlan);
}

export function resolveRules(row: Pick<TenantPolicyRow, 'tier' | 'tenantPlan' | 'rules' | 'customOverrides'>): {
  tier: PolicyTier;
  rules: PolicyRules;
  customOverrides: PolicyRules;
} {
  const tier = resolveTier(row);
  const customOverrides = parseRules(row.customOverrides) ?? [];
  const storedRules = parseRules(row.rules);

  return {
    tier,
    customOverrides,
    rules: storedRules ?? applyPolicyOverrides(getDefaultPolicy(tier).rules, customOverrides),
  };
}

