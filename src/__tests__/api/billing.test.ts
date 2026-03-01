import type { NextRequest } from 'next/server';
import { POST as checkoutPOST } from '@/app/api/billing/checkout/route';
import { POST as portalPOST } from '@/app/api/billing/portal/route';
import { GET as statusGET } from '@/app/api/billing/status/route';
import { POST as webhookPOST } from '@/app/api/billing/webhook/route';
import { getTenantId } from '@/lib/tenant';
import {
  cancelTenantSubscriptionByStripeId,
  getTeamSeatCount,
  getTenantSubscription,
  isStripePlaceholderMode,
  upsertTenantSubscription,
} from '@/lib/billing';
import { db } from '@/lib/db';
import { createVPS } from '@/lib/provisioning';
import { auth } from '@/lib/auth';

const mockStripeCheckoutCreate = jest.fn();
const mockStripePortalCreate = jest.fn();
const mockStripeConstructEvent = jest.fn();
const mockStripeConstructor = jest.fn().mockImplementation(() => ({
  checkout: {
    sessions: {
      create: mockStripeCheckoutCreate,
    },
  },
  billingPortal: {
    sessions: {
      create: mockStripePortalCreate,
    },
  },
  webhooks: {
    constructEvent: mockStripeConstructEvent,
  },
}));

jest.mock('stripe', () => ({
  __esModule: true,
  default: mockStripeConstructor,
}));

jest.mock('@/lib/tenant', () => ({
  getTenantId: jest.fn(),
}));

jest.mock('@/lib/billing', () => ({
  getTenantSubscription: jest.fn(),
  isStripePlaceholderMode: jest.fn(),
  upsertTenantSubscription: jest.fn(),
  cancelTenantSubscriptionByStripeId: jest.fn(),
  getTeamSeatCount: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/lib/provisioning', () => ({
  createVPS: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

const mockedGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
const mockedGetTenantSubscription = getTenantSubscription as jest.MockedFunction<typeof getTenantSubscription>;
const mockedIsStripePlaceholderMode = isStripePlaceholderMode as jest.MockedFunction<typeof isStripePlaceholderMode>;
const mockedUpsertTenantSubscription = upsertTenantSubscription as jest.MockedFunction<typeof upsertTenantSubscription>;
const mockedCancelTenantSubscriptionByStripeId =
  cancelTenantSubscriptionByStripeId as jest.MockedFunction<typeof cancelTenantSubscriptionByStripeId>;
const mockedGetTeamSeatCount = getTeamSeatCount as jest.MockedFunction<typeof getTeamSeatCount>;
const mockedCreateVPS = createVPS as jest.MockedFunction<typeof createVPS>;
const mockedDb = db as unknown as { select: jest.Mock };
// auth has NextAuth overloads; cast for test-only mock helpers.
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;

const originalEnv = process.env;

function makeRequest(options?: {
  headers?: Record<string, string>;
  jsonBody?: unknown;
  jsonError?: Error;
  textBody?: string;
}): NextRequest {
  const headers = options?.headers ?? {};

  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? headers[key] ?? null,
    },
    json: jest.fn().mockImplementation(async () => {
      if (options?.jsonError) throw options.jsonError;
      return options?.jsonBody ?? {};
    }),
    text: jest.fn().mockResolvedValue(options?.textBody ?? ''),
  } as unknown as NextRequest;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function mockSelectWithLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from } as never);
  return { limit, where, from };
}

describe('billing api routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockedGetTenantId.mockReturnValue(1);
    mockedIsStripePlaceholderMode.mockReturnValue(false);
    mockedGetTenantSubscription.mockResolvedValue({
      tenantId: 1,
      plan: 'pro',
      seats: 1,
      status: 'active',
      stripeCustomerId: 'cus_default',
      stripeSubscriptionId: 'sub_default',
      currentPeriodEnd: null,
    });
    mockedUpsertTenantSubscription.mockResolvedValue(undefined);
    mockedCancelTenantSubscriptionByStripeId.mockResolvedValue(undefined);
    mockedGetTeamSeatCount.mockImplementation((input: unknown) => {
      const parsed = Number(input ?? 10);
      if (!Number.isFinite(parsed)) return 10;
      return Math.max(1, Math.floor(parsed));
    });
    mockedCreateVPS.mockResolvedValue({} as Awaited<ReturnType<typeof createVPS>>);
    mockedAuth.mockResolvedValue(null);

    mockStripeCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/session_123' });
    mockStripePortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session_123' });
    mockStripeConstructEvent.mockReturnValue({ type: 'unhandled.event' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates a checkout session for pro plans', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_123';
    mockedGetTenantId.mockReturnValue(7);

    const response = await checkoutPOST(makeRequest({ jsonBody: { plan: 'pro' } }));

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ url: 'https://checkout.stripe.com/c/session_123' });
    expect(mockStripeConstructor).toHaveBeenCalledWith('sk_test_123');
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_pro_123', quantity: 1 }],
        metadata: expect.objectContaining({ tenantId: '7', plan: 'pro' }),
      })
    );
  });

  it('rejects checkout when tenant is missing', async () => {
    mockedGetTenantId.mockReturnValue(null);

    const response = await checkoutPOST(makeRequest({ jsonBody: { plan: 'pro' } }));

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects team checkout with seats below minimum', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_TEAM_PRICE_ID = 'price_team_123';

    const response = await checkoutPOST(makeRequest({ jsonBody: { plan: 'team', seats: 9 } }));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: 'team plan requires seats >= 10' });
    expect(mockStripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('returns validation errors for malformed checkout body', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const response = await checkoutPOST(makeRequest({ jsonError: new Error('invalid json') }));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toEqual(expect.stringContaining('plan'));
  });

  it('returns portal redirect in placeholder mode', async () => {
    mockedIsStripePlaceholderMode.mockReturnValue(true);

    const response = await portalPOST(makeRequest());

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ url: '/dashboard?billing=portal', mock: true });
    expect(mockedGetTenantSubscription).not.toHaveBeenCalled();
  });

  it('creates a customer billing portal session', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    mockedGetTenantId.mockReturnValue(15);
    mockedGetTenantSubscription.mockResolvedValue({
      tenantId: 15,
      plan: 'team',
      seats: 22,
      status: 'active',
      stripeCustomerId: 'cus_abc123',
      stripeSubscriptionId: 'sub_abc123',
      currentPeriodEnd: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await portalPOST(makeRequest());

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ url: 'https://billing.stripe.com/p/session_123' });
    expect(mockStripePortalCreate).toHaveBeenCalledWith({
      customer: 'cus_abc123',
      return_url: 'https://app.example.com/dashboard/billing',
    });
  });

  it('rejects portal session creation without Stripe customer id', async () => {
    mockedGetTenantSubscription.mockResolvedValue({
      tenantId: 1,
      plan: 'free',
      seats: 1,
      status: 'active',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    });

    const response = await portalPOST(makeRequest());

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: 'No Stripe customer found for this tenant.' });
    expect(mockStripePortalCreate).not.toHaveBeenCalled();
  });

  it('returns billing status with subscription usage fields', async () => {
    const periodEnd = new Date('2026-01-15T00:00:00.000Z');
    mockedGetTenantId.mockReturnValue(33);
    mockedGetTenantSubscription.mockResolvedValue({
      tenantId: 33,
      plan: 'team',
      seats: 25,
      status: 'past_due',
      stripeCustomerId: 'cus_usage',
      stripeSubscriptionId: 'sub_usage',
      currentPeriodEnd: periodEnd,
    });

    const response = await statusGET(makeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      tenantId: 33,
      plan: 'team',
      status: 'past_due',
      seats: 25,
      currentPeriodEnd: periodEnd.toISOString(),
    });
    expect(mockedGetTenantSubscription).toHaveBeenCalledWith(33);
  });

  it('rejects webhook events with missing Stripe signature when verification is enabled', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_real';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const response = await webhookPOST(makeRequest({ textBody: '{"type":"checkout.session.completed"}' }));

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: 'Missing Stripe signature.' });
  });

  it('rejects webhook events with invalid Stripe signature', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_real';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    mockStripeConstructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const response = await webhookPOST(
      makeRequest({
        headers: { 'stripe-signature': 'sig_invalid' },
        textBody: '{"type":"checkout.session.completed"}',
      })
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({ error: 'Invalid Stripe signature.' });
  });

  it('handles checkout.session.completed webhook and provisions paid tenant', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_real';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    mockedGetTeamSeatCount.mockReturnValue(8);
    mockStripeConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { tenantId: '42', plan: 'team', seats: '8' },
          customer: 'cus_checkout',
          subscription: 'sub_checkout',
          customer_email: 'owner@example.com',
        },
      },
    });

    const response = await webhookPOST(
      makeRequest({
        headers: { 'stripe-signature': 'sig_valid' },
        textBody: '{"type":"checkout.session.completed"}',
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ received: true });
    expect(mockedUpsertTenantSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        plan: 'team',
        seats: 10,
        status: 'active',
        stripeCustomerId: 'cus_checkout',
        stripeSubscriptionId: 'sub_checkout',
      })
    );
    expect(mockedCreateVPS).toHaveBeenCalledWith({
      tenantId: 42,
      plan: 'archon',
      tenantEmail: 'owner@example.com',
    });
  });

  it('updates subscription state from customer.subscription.updated and DB lookup fallback', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
    mockSelectWithLimit([{ tenantId: 99 }]);

    const response = await webhookPOST(
      makeRequest({
        textBody: JSON.stringify({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_lookup_123',
              metadata: { plan: 'pro' },
              status: 'past_due',
              customer: 'cus_lookup',
              items: { data: [{ quantity: 1 }] },
              current_period_end: 1735689600,
            },
          },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ received: true });
    expect(mockedUpsertTenantSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 99,
        plan: 'pro',
        seats: 1,
        status: 'past_due',
        stripeCustomerId: 'cus_lookup',
        stripeSubscriptionId: 'sub_lookup_123',
        currentPeriodEnd: new Date(1735689600 * 1000),
      })
    );
  });

  it('cancels local subscription state when customer.subscription.deleted is received', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';

    const response = await webhookPOST(
      makeRequest({
        textBody: JSON.stringify({
          type: 'customer.subscription.deleted',
          data: { object: { id: 'sub_deleted_123' } },
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ received: true });
    expect(mockedCancelTenantSubscriptionByStripeId).toHaveBeenCalledWith('sub_deleted_123');
  });
});
