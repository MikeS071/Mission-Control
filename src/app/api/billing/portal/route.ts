import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/tenant';
import { getTenantSubscription, isStripePlaceholderMode } from '@/lib/billing';

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (isStripePlaceholderMode()) {
    return NextResponse.json({ url: '/dashboard?billing=portal', mock: true });
  }

  const subscription = await getTenantSubscription(tenantId);
  if (!subscription.stripeCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer found for this tenant.' }, { status: 400 });
  }

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://127.0.0.1:3003';

  const portal = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${baseUrl}/dashboard/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
