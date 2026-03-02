import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenantSettings, tenants } from '@/db/schema';

export interface AuthorizeInboundInput {
  tenantId: number;
  userId: number;
  telegramUserId?: number;
  kind: 'telegram_message' | 'mc_message';
  content: string;
}

export interface AuthorizeInboundResult {
  allow: boolean;
  reason?: string;
}

export type PolicyTier = 'free' | 'pro';
export type LimitKey = 'api_calls_per_day' | 'agents';
export type FeatureKey = 'models';

export interface TenantPolicy {
  tier: PolicyTier;
  limits: Record<LimitKey, number>;
  features: Record<FeatureKey, boolean>;
}

interface StoredPolicy {
  tier?: unknown;
  limits?: {
    api_calls_per_day?: unknown;
    agents?: unknown;
  };
  features?: {
    models?: unknown;
  };
}

interface TenantSettingsPayload {
  policy?: StoredPolicy;
  [key: string]: unknown;
}

export interface LimitCheckResult {
  allowed: boolean;
  key: LimitKey;
  current: number;
  limit: number;
  remaining: number;
  reason?: string;
  upgradeRequired?: boolean;
}

const FREE_BASE_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'openclaw:main',
]);

const DEFAULT_FREE_POLICY: TenantPolicy = {
  tier: 'free',
  limits: {
    api_calls_per_day: 100,
    agents: 1,
  },
  features: {
    models: true,
  },
};

const DEFAULT_PRO_POLICY: TenantPolicy = {
  tier: 'pro',
  limits: {
    api_calls_per_day: 10_000,
    agents: 25,
  },
  features: {
    models: true,
  },
};

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function normalizeTier(value: unknown): PolicyTier {
  return value === 'pro' ? 'pro' : 'free';
}

function defaultPolicyForTier(tier: PolicyTier): TenantPolicy {
  return tier === 'pro' ? { ...DEFAULT_PRO_POLICY, limits: { ...DEFAULT_PRO_POLICY.limits }, features: { ...DEFAULT_PRO_POLICY.features } } : { ...DEFAULT_FREE_POLICY, limits: { ...DEFAULT_FREE_POLICY.limits }, features: { ...DEFAULT_FREE_POLICY.features } };
}

function normalizePolicy(input: StoredPolicy | undefined, fallbackTier: PolicyTier): TenantPolicy {
  const tier = normalizeTier(input?.tier ?? fallbackTier);
  const defaults = defaultPolicyForTier(tier);
  return {
    tier,
    limits: {
      api_calls_per_day: asPositiveInt(input?.limits?.api_calls_per_day, defaults.limits.api_calls_per_day),
      agents: asPositiveInt(input?.limits?.agents, defaults.limits.agents),
    },
    features: {
      models: typeof input?.features?.models === 'boolean' ? input.features.models : defaults.features.models,
    },
  };
}

function planToTier(plan: unknown): PolicyTier {
  return plan === 'pro' || plan === 'team' ? 'pro' : 'free';
}

function isBaseModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (FREE_BASE_MODELS.has(normalized)) return true;
  return normalized.includes('mini') || normalized.includes('haiku');
}

export async function getOrCreatePolicy(tenantId: number): Promise<TenantPolicy> {
  const [tenantRow] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const tierFromPlan = planToTier(tenantRow?.plan);

  const [settingsRow] = await db
    .select({ id: tenantSettings.id, settings: tenantSettings.settings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const existingSettings = (settingsRow?.settings ?? {}) as TenantSettingsPayload;
  const existingPolicy = existingSettings.policy;
  if (existingPolicy) {
    return normalizePolicy(existingPolicy, tierFromPlan);
  }

  const createdPolicy = defaultPolicyForTier(tierFromPlan);
  const nextSettings: TenantSettingsPayload = { ...existingSettings, policy: createdPolicy };

  if (settingsRow?.id) {
    await db
      .update(tenantSettings)
      .set({ settings: nextSettings, updatedAt: new Date() })
      .where(and(eq(tenantSettings.id, settingsRow.id), eq(tenantSettings.tenantId, tenantId)));
  } else {
    await db
      .insert(tenantSettings)
      .values({ tenantId, settings: nextSettings, updatedAt: new Date() });
  }

  return createdPolicy;
}

export function checkLimit(policy: TenantPolicy, key: LimitKey, currentCount: number): LimitCheckResult {
  const limit = policy.limits[key];
  const current = Math.max(0, Math.floor(currentCount));
  const remaining = Math.max(0, limit - current);
  const allowed = current < limit;

  if (allowed) {
    return { allowed, key, current, limit, remaining };
  }

  const reason = key === 'api_calls_per_day'
    ? 'Daily API call limit reached'
    : 'Agent limit reached for current plan';

  return {
    allowed,
    key,
    current,
    limit,
    remaining,
    reason,
    upgradeRequired: policy.tier === 'free',
  };
}

export function isFeatureEnabled(policy: TenantPolicy, feature: FeatureKey): boolean {
  if (policy.tier === 'pro' && feature === 'models') return true;
  return Boolean(policy.features[feature]);
}

export function isModelAllowedForPolicy(policy: TenantPolicy, model: string): boolean {
  if (!isFeatureEnabled(policy, 'models')) return false;
  if (policy.tier === 'pro') return true;
  return isBaseModel(model);
}

export function filterModelsForPolicy<T extends { model: string }>(policy: TenantPolicy, models: T[]): T[] {
  if (!isFeatureEnabled(policy, 'models')) return [];
  if (policy.tier === 'pro') return models;
  return models.filter((item) => isModelAllowedForPolicy(policy, item.model));
}

/**
 * Policy/RBAC gate (stub).
 *
 * v1: allow-all. This is intentionally the single choke point used by all ingress.
 * Future: enforce feature flags, limits, and tool permissions per tenant/role.
 */
export async function authorizeInbound(_input: AuthorizeInboundInput): Promise<AuthorizeInboundResult> {
  return { allow: true };
}

export type {
  AdminPolicyUpdateInput,
  Policy,
  PolicyOverrides,
  PolicyRule,
  PolicyRules,
  PolicyTier,
} from './schema';
