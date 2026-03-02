import { PRICING_CONFIG, type PricingPlan } from '@/lib/usage/pricing-config';

function normalizePlan(plan: string): PricingPlan {
  if (plan === 'pro' || plan === 'team') return plan;
  return 'free';
}

export function getTenantCost(baseCostUsd: number, model: string, tenantPlan: string): number {
  const safeBaseCost = Number.isFinite(baseCostUsd) && baseCostUsd > 0 ? baseCostUsd : 0;
  const plan = normalizePlan(tenantPlan);
  const modelKey = model.trim().toLowerCase() as keyof typeof PRICING_CONFIG.modelOverrides;
  const modelOverride = PRICING_CONFIG.modelOverrides[modelKey];
  const markupPercent = modelOverride ? modelOverride[plan] : PRICING_CONFIG.defaultMarkup[plan];

  return safeBaseCost * (1 + markupPercent / 100) + PRICING_CONFIG.flatFeePerRequest;
}
