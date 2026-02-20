import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { isStripePlaceholderMode } from '@/lib/billing';

type CheckoutBody = {
  plan?: 'pro' | 'team';
};

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CheckoutBody;
  const plan = body.plan;

  if (plan !== 'pro' && plan !== 'team') {
    return NextResponse.json({ error: 'Invalid plan. Must be pro or team.' }, { status: 400 });
  }

  if (isStripePlaceholderMode()) {
    return NextResponse.json({ url: '/dashboard?billing=placeholder', mock: true });
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

  const priceId = plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: 'Stripe price IDs are not configured.' }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://127.0.0.1:3003';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${baseUrl}/dashboard/billing?checkout=canceled`,
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
