import { z } from 'zod';

export const POLICY_FEATURE_KEYS = [
  'agents',
  'models',
  'storage_mb',
  'api_calls_per_day',
  'custom_tools',
  'team_members',
] as const;

export const PolicyFeatureKeySchema = z.enum(POLICY_FEATURE_KEYS);

export const PolicyLimitTypeSchema = z.enum(['boolean', 'number', 'unlimited']);

export const PolicyRuleSchema = z
  .object({
    featureKey: PolicyFeatureKeySchema,
    limitType: PolicyLimitTypeSchema,
    limitValue: z.union([z.boolean(), z.number().finite(), z.null()]),
    enabled: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    if (rule.limitType === 'boolean' && typeof rule.limitValue !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitValue'],
        message: 'limitValue must be boolean when limitType is boolean',
      });
      return;
    }

    if (rule.limitType === 'number' && typeof rule.limitValue !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitValue'],
        message: 'limitValue must be number when limitType is number',
      });
      return;
    }

    if (rule.limitType === 'unlimited' && rule.limitValue !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitValue'],
        message: 'limitValue must be null when limitType is unlimited',
      });
    }
  });

export const PolicyRulesSchema = z.array(PolicyRuleSchema);
export const PolicyOverridesSchema = z.array(PolicyRuleSchema);

export const PolicyTierNameSchema = z.enum(['free', 'pro', 'team']);

export const PolicyTierSchema = z.object({
  name: PolicyTierNameSchema,
  rules: PolicyRulesSchema,
});

export const PolicySchema = z.object({
  tenantId: z.number().int().positive(),
  tier: PolicyTierNameSchema,
  rules: PolicyRulesSchema,
  customOverrides: PolicyOverridesSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AdminPolicyUpdateSchema = z
  .object({
    tier: PolicyTierNameSchema.optional(),
    customOverrides: PolicyOverridesSchema.optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((payload) => payload.tier !== undefined || payload.customOverrides !== undefined, {
    message: 'tier or customOverrides must be provided',
    path: ['tier'],
  });

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;
export type PolicyOverrides = z.infer<typeof PolicyOverridesSchema>;
export type PolicyTier = z.infer<typeof PolicyTierNameSchema>;
export type PolicyTemplate = z.infer<typeof PolicyTierSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type AdminPolicyUpdateInput = z.infer<typeof AdminPolicyUpdateSchema>;

export function validateRule(input: unknown) {
  return PolicyRuleSchema.safeParse(input);
}

export function validatePolicy(input: unknown) {
  return PolicySchema.safeParse(input);
}

