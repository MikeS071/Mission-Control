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
} from '@/lib/policy/schema';
