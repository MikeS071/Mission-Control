import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subscriptions } from '@/db/schema';

export type BillingPlan = 'free' | 'pro' | 'team';
export type BillingStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

const PLAN_RANK: Record<BillingPlan, number> = {
  free: 0,
  pro: 1,
  team: 2,
};

/**
 * Returns a human-readable display label for a plan slug.
 * Uses title-case of the slug with a fallback to 'Free'.
 */
export function getTenantPlanLabel(plan: string | null | undefined): string {
  if (!plan) return 'Free';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export async function getTenantPlan(tenantId: number): Promise<BillingPlan> {
  const [subscription] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  const plan = subscription?.plan as BillingPlan | undefined;
  if (plan === 'pro' || plan === 'team') return plan;
  return 'free';
}

export async function requirePlan(tenantId: number, minPlan: 'pro' | 'team'): Promise<boolean> {
  const current = await getTenantPlan(tenantId);
  return PLAN_RANK[current] >= PLAN_RANK[minPlan];
}

export type TenantSubscription = {
  tenantId: number;
  plan: BillingPlan;
  seats: number;
  status: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
};

export async function getTenantSubscription(tenantId: number): Promise<TenantSubscription> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  if (!subscription) {
    return {
      tenantId,
      plan: 'free' as BillingPlan,
      seats: 1,
      status: 'active' as BillingStatus,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    };
  }

  const plan = subscription.plan as BillingPlan;
  return {
    ...subscription,
    plan: plan === 'pro' || plan === 'team' ? plan : 'free',
    status: (subscription.status ?? 'active') as BillingStatus,
    seats: subscription.seats ?? 1,
  };
}

export function isPlaceholderMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return !key || key.startsWith('sk_test_placeholder');
}

export const isStripePlaceholderMode = isPlaceholderMode;

export function getTeamSeatCount(input: unknown): number {
  const seats = Number(input ?? 10);
  if (!Number.isFinite(seats)) return 10;
  return Math.max(1, Math.floor(seats));
}

export async function upsertTenantSubscription(data: {
  tenantId: number;
  plan: BillingPlan;
  seats?: number;
  status?: BillingStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
}) {
  const now = new Date();
  const payload = {
    tenantId: data.tenantId,
    plan: data.plan,
    seats: data.seats ?? 1,
    status: data.status ?? 'active',
    stripeCustomerId: data.stripeCustomerId ?? null,
    stripeSubscriptionId: data.stripeSubscriptionId ?? null,
    currentPeriodEnd: data.currentPeriodEnd ?? null,
    updatedAt: now,
  };

  await db
    .insert(subscriptions)
    .values({ ...payload, createdAt: now })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: payload,
    });
}

export async function cancelTenantSubscriptionByStripeId(stripeSubscriptionId: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  if (!existing) return;

  await db
    .update(subscriptions)
    .set({
      plan: 'free',
      status: 'canceled',
      stripeSubscriptionId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.tenantId, existing.tenantId), eq(subscriptions.id, existing.id)));
}
