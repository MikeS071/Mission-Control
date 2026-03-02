import { z } from 'zod';

export const PolicyFeatureKeySchema = z.enum([
  'agents',
  'models',
  'storage_mb',
  'api_calls_per_day',
  'custom_tools',
  'team_members',
] as const);

export const PolicyLimitTypeSchema = z.enum(['boolean', 'number', 'unlimited'] as const);

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

export const PolicyTierNameSchema = z.enum(['free', 'pro', 'enterprise'] as const);

export const PolicyTierSchema = z.object({
  name: PolicyTierNameSchema,
  rules: z.array(PolicyRuleSchema),
});

export const PolicySchema = z.object({
  tenantId: z.number().int().positive(),
  tier: PolicyTierNameSchema,
  customOverrides: z.array(PolicyRuleSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyTier = z.infer<typeof PolicyTierSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PolicyRules = PolicyRule[];
export type PolicyOverrides = Record<string, unknown>;

export function validateRule(input: unknown) {
  return PolicyRuleSchema.safeParse(input);
}

export function validatePolicy(input: unknown) {
  return PolicySchema.safeParse(input);
}
