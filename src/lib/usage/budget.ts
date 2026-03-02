import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type PolicyRule, type PolicyRules, PolicyRulesSchema } from '@/lib/policy/schema';
import { applyPolicyOverrides, coercePolicyTier, getDefaultPolicy } from '@/lib/policy/templates';

export const UNLIMITED_BUDGET = Number.MAX_SAFE_INTEGER;

type BudgetRuleKey = 'api_calls_per_day' | 'budget_usd_per_month';
type BudgetPeriod = 'daily' | 'monthly';

type BudgetRule = {
  key: BudgetRuleKey;
  period: BudgetPeriod;
  limit: number;
};

type PolicyRow = {
  tier?: unknown;
  rules?: unknown;
  customOverrides?: unknown;
};

function parseRules(input: unknown): PolicyRules | null {
  const parsed = PolicyRulesSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function resolvePolicyRules(row: PolicyRow): PolicyRules {
  const baseRules = parseRules(row.rules) ?? getDefaultPolicy(coercePolicyTier(row.tier)).rules;
  const customOverrides = parseRules(row.customOverrides) ?? [];
  return applyPolicyOverrides(baseRules, customOverrides);
}

function parseBudgetRule(rule: PolicyRule, key: BudgetRuleKey, period: BudgetPeriod): BudgetRule | null {
  if (!rule.enabled) {
    return { key, period, limit: 0 };
  }

  if (rule.limitType === 'unlimited') {
    return null;
  }

  if (rule.limitType !== 'number' || typeof rule.limitValue !== 'number' || !Number.isFinite(rule.limitValue)) {
    return null;
  }

  if (key === 'api_calls_per_day') {
    return { key, period, limit: Math.max(0, Math.floor(rule.limitValue)) };
  }

  return { key, period, limit: Math.max(0, rule.limitValue) };
}

function resolveBudgetRule(rules: PolicyRules): BudgetRule | null {
  const apiCallsRule = rules.find((rule) => rule.featureKey === 'api_calls_per_day');
  if (apiCallsRule) {
    return parseBudgetRule(apiCallsRule, 'api_calls_per_day', 'daily');
  }

  const monthlyUsdRule = rules.find((rule) => rule.featureKey === 'budget_usd_per_month');
  if (monthlyUsdRule) {
    return parseBudgetRule(monthlyUsdRule, 'budget_usd_per_month', 'monthly');
  }

  return null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function normalizeUsage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

async function readCurrentUsage(tenantId: number, rule: BudgetRule, periodStart: Date): Promise<number> {
  if (rule.key === 'api_calls_per_day') {
    const result = await db.execute(sql`
      SELECT request_count::double precision AS used
      FROM usage_summary
      WHERE tenant_id = ${tenantId}
        AND period = ${rule.period}
        AND period_start = ${periodStart}
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const row = result.rows[0] as { used?: unknown } | undefined;
    return normalizeUsage(row?.used);
  }

  const result = await db.execute(sql`
    SELECT total_cost_usd::double precision AS used
    FROM usage_summary
    WHERE tenant_id = ${tenantId}
      AND period = ${rule.period}
      AND period_start = ${periodStart}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const row = result.rows[0] as { used?: unknown } | undefined;
  return normalizeUsage(row?.used);
}

export function budgetHeaderValue(value: number): string {
  if (!Number.isFinite(value) || value >= UNLIMITED_BUDGET) return 'unlimited';
  return String(Math.max(0, Math.floor(value)));
}

export function budgetResetsAt(period: string, now = new Date()): string {
  if (period === 'daily') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
  }
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  }
  return now.toISOString();
}

export async function checkBudget(tenantId: number): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  period: string;
}> {
  const policyResult = await db.execute(sql`
    SELECT
      tier,
      rules,
      custom_overrides AS "customOverrides"
    FROM policies
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `);

  const policyRow = policyResult.rows[0] as PolicyRow | undefined;
  if (!policyRow) {
    return {
      allowed: true,
      remaining: UNLIMITED_BUDGET,
      limit: UNLIMITED_BUDGET,
      period: 'unlimited',
    };
  }

  const rules = resolvePolicyRules(policyRow);
  const budgetRule = resolveBudgetRule(rules);
  if (!budgetRule) {
    return {
      allowed: true,
      remaining: UNLIMITED_BUDGET,
      limit: UNLIMITED_BUDGET,
      period: 'unlimited',
    };
  }

  const now = new Date();
  const periodStart = budgetRule.period === 'daily' ? startOfUtcDay(now) : startOfUtcMonth(now);
  const used = await readCurrentUsage(tenantId, budgetRule, periodStart);
  const remaining = Math.max(0, budgetRule.limit - used);

  return {
    allowed: used < budgetRule.limit,
    remaining,
    limit: budgetRule.limit,
    period: budgetRule.period,
  };
}
