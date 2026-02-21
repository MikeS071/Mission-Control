import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { parseBody, BillingCheckoutSchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(BillingCheckoutSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const { plan } = parsed.data;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[billing/checkout] STRIPE_SECRET_KEY is not set — cannot create checkout session');
    return NextResponse.json({ error: 'Stripe is not configured on the server.' }, { status: 500 });
  }

  // Warn if still using placeholder/test key so it's visible in logs — but proceed anyway
  if (stripeKey.startsWith('sk_test_placeholder')) {
    console.warn('[billing/checkout] WARNING: STRIPE_SECRET_KEY appears to be a placeholder value. Attempting checkout anyway.');
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);

  const priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: 'Stripe price IDs are not configured.' }, { status: 500 });
  }

  // Use archonhq.ai/dashboard as the canonical redirect target
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://archonhq.ai/dashboard?billing=success',
    cancel_url: 'https://archonhq.ai/dashboard?billing=canceled',
    metadata: {
      tenantId: String(tenantId),
      plan,
    },
    subscription_data: {
      metadata: {
        tenantId: String(tenantId),
        plan,
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
