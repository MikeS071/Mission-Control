import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { isStripePlaceholderMode } from '@/lib/billing';
import { parseBody, BillingCheckoutSchema } from '@/lib/validate';

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(BillingCheckoutSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const { plan } = parsed.data;

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
