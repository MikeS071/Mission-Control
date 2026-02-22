import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subscriptions } from '@/db/schema';
import {
  cancelTenantSubscriptionByStripeId,
  getTeamSeatCount,
  upsertTenantSubscription,
} from '@/lib/billing';
import { createVPS } from '@/lib/provisioning';

function parseTenantIdFromMetadata(metadata: Record<string, string | null> | null | undefined): number | null {
  const tenantId = Number(metadata?.tenantId ?? '');
  return Number.isFinite(tenantId) && tenantId > 0 ? tenantId : null;
}

function parsePlan(input: string | null | undefined): 'free' | 'pro' | 'team' {
  if (input === 'pro' || input === 'team') return input;
  return 'free';
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  const rawBody = await req.text();

  let event: any;

  if (!webhookSecret || webhookSecret === 'whsec_placeholder') {
    event = JSON.parse(rawBody);
  } else {
    const signature = req.headers.get('stripe-signature');
    if (!signature) return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
    }
  }

  switch (event?.type) {
    case 'checkout.session.completed': {
      const session = event.data?.object;
      const tenantId = parseTenantIdFromMetadata(session?.metadata);
      if (!tenantId) break;

      const plan = parsePlan(session?.metadata?.plan);
      const seats = plan === 'team' ? Math.max(10, getTeamSeatCount(session?.metadata?.seats)) : 1;

      await upsertTenantSubscription({
        tenantId,
        plan,
        seats,
        status: 'active',
        stripeCustomerId: session?.customer ?? null,
        stripeSubscriptionId: session?.subscription ?? null,
      });

      // Trigger VPS provisioning for paid tiers (pro = Strategos, team = Archon)
      if (plan === 'pro' || plan === 'team') {
        const provisionPlan = plan === 'team' ? 'archon' : 'strategos';
        const email = session?.customer_email || session?.customer_details?.email || 'unknown@example.com';

        // Fire-and-forget provisioning
        createVPS({
          tenantId,
          plan: provisionPlan,
          tenantEmail: email,
        }).catch((error) => {
          console.error(`Failed to provision VPS for tenant ${tenantId}:`, error);
        });
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data?.object;
      const tenantId = parseTenantIdFromMetadata(sub?.metadata);
      const stripeSubscriptionId = sub?.id as string | undefined;

      let resolvedTenantId = tenantId;
      if (!resolvedTenantId && stripeSubscriptionId) {
        const [existing] = await db
          .select({ tenantId: subscriptions.tenantId })
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
          .limit(1);
        resolvedTenantId = existing?.tenantId ?? null;
      }

      if (!resolvedTenantId) break;

      const plan = parsePlan(sub?.metadata?.plan);
      const quantity = sub?.items?.data?.[0]?.quantity;
      const seats = plan === 'team' ? Math.max(10, getTeamSeatCount(quantity ?? sub?.metadata?.seats)) : 1;
      const periodEndUnix = Number(sub?.current_period_end ?? 0);

      await upsertTenantSubscription({
        tenantId: resolvedTenantId,
        plan,
        seats,
        status: sub?.status ?? 'active',
        stripeCustomerId: sub?.customer ?? null,
        stripeSubscriptionId: stripeSubscriptionId ?? null,
        currentPeriodEnd: periodEndUnix > 0 ? new Date(periodEndUnix * 1000) : null,
      });

      // Trigger VPS provisioning for new paid subscriptions
      if (event?.type === 'customer.subscription.created' && (plan === 'pro' || plan === 'team')) {
        const provisionPlan = plan === 'team' ? 'archon' : 'strategos';

        // Get tenant email from database
        const [tenant] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, resolvedTenantId))
          .limit(1);

        const email = sub?.customer_email || 'unknown@example.com';

        // Fire-and-forget provisioning
        createVPS({
          tenantId: resolvedTenantId,
          plan: provisionPlan,
          tenantEmail: email,
        }).catch((error) => {
          console.error(`Failed to provision VPS for tenant ${resolvedTenantId}:`, error);
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data?.object;
      const stripeSubscriptionId = sub?.id as string | undefined;
      if (!stripeSubscriptionId) break;
      await cancelTenantSubscriptionByStripeId(stripeSubscriptionId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
