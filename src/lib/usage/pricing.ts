import { PRICING_CONFIG } from '@/lib/usage/pricing-config';

type TenantPlan = keyof typeof PRICING_CONFIG.defaultMarkup;

export interface PricingRate {
  modelPattern: string;
  markupPercent: number;
  flatFeePerRequest: number;
}

function normalizePlan(plan: string): TenantPlan {
  const normalized = plan.trim().toLowerCase();
  if (normalized === 'pro' || normalized === 'team' || normalized === 'free') return normalized;
  return 'free';
}

function matchesPattern(pattern: string, model: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(model.toLowerCase());
}

function resolvePricingRate(model: string, tenantPlan: string): PricingRate {
  const plan = normalizePlan(tenantPlan);
  const normalizedModel = model.trim();

  for (const [modelPattern, markupByPlan] of Object.entries(PRICING_CONFIG.modelOverrides)) {
    if (!matchesPattern(modelPattern, normalizedModel)) continue;
    return {
      modelPattern,
      markupPercent: markupByPlan[plan],
      flatFeePerRequest: PRICING_CONFIG.flatFeePerRequest,
    };
  }

  return {
    modelPattern: '*',
    markupPercent: PRICING_CONFIG.defaultMarkup[plan],
    flatFeePerRequest: PRICING_CONFIG.flatFeePerRequest,
  };
}

export function getTenantCost(baseCostUsd: number, model: string, tenantPlan: string): number {
  const normalizedBaseCost = Number.isFinite(baseCostUsd) ? baseCostUsd : 0;
  const rate = resolvePricingRate(model, tenantPlan);
  return normalizedBaseCost * (1 + rate.markupPercent / 100) + rate.flatFeePerRequest;
}
