import {
  getTenantPlan,
  requirePlan,
  getTenantSubscription,
  isPlaceholderMode,
  isStripePlaceholderMode,
  getTeamSeatCount,
  upsertTenantSubscription,
  cancelTenantSubscriptionByStripeId,
} from '@/lib/billing';
import { db } from '@/lib/db';

type MockDb = jest.Mocked<typeof db>;

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedDb = db as MockDb;

describe('billing helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
  });

  function mockSelectWithLimit(rows: any[]) {
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    mockedDb.select.mockReturnValueOnce({ from } as any);
  }

  function mockInsertChain() {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const returning = jest.fn().mockResolvedValue([]);
    const values = jest.fn().mockReturnValue({
      onConflictDoUpdate,
      returning,
      then: (resolve: (value: unknown) => void) => {
        resolve(undefined);
      },
    });
    mockedDb.insert.mockReturnValueOnce({ values } as any);
    return { values, onConflictDoUpdate, returning };
  }

  function mockUpdateChain() {
    const whereResult = {
      then: (resolve: (value: unknown) => void) => resolve(undefined),
    };
    const where = jest.fn().mockReturnValue(whereResult);
    const set = jest.fn().mockReturnValue({ where });
    mockedDb.update.mockReturnValueOnce({ set } as any);
    return { set, where };
  }

  it('returns explicit paid plans, defaulting to free otherwise', async () => {
    mockSelectWithLimit([{ plan: 'pro' }]);
    await expect(getTenantPlan(1)).resolves.toBe('pro');

    mockSelectWithLimit([{ plan: 'basic' }]);
    await expect(getTenantPlan(2)).resolves.toBe('free');
  });

  it('requirePlan enforces plan hierarchy', async () => {
    mockSelectWithLimit([{ plan: 'team' }]);
    await expect(requirePlan(9, 'pro')).resolves.toBe(true);

    mockSelectWithLimit([{ plan: 'free' }]);
    await expect(requirePlan(9, 'team')).resolves.toBe(false);
  });

  it('returns hydrated subscription rows or sensible defaults', async () => {
    const baseDate = new Date('2024-01-01T00:00:00.000Z');
    mockSelectWithLimit([
      {
        tenantId: 5,
        plan: 'team',
        seats: 8,
        status: 'past_due',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodEnd: baseDate,
      },
    ]);
    await expect(getTenantSubscription(5)).resolves.toMatchObject({
      plan: 'team',
      seats: 8,
      status: 'past_due',
      stripeCustomerId: 'cus_123',
    });

    mockSelectWithLimit([]);
    await expect(getTenantSubscription(44)).resolves.toMatchObject({
      tenantId: 44,
      plan: 'free',
      seats: 1,
      status: 'active',
      stripeCustomerId: null,
      currentPeriodEnd: null,
    });
  });

  it('normalizes stored subscription rows with missing metadata', async () => {
    mockSelectWithLimit([
      {
        tenantId: 6,
        plan: 'legacy',
        seats: null,
        status: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    ]);

    await expect(getTenantSubscription(6)).resolves.toMatchObject({ plan: 'free', seats: 1, status: 'active' });
  });

  it('normalizes placeholder Stripe keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_abc';
    expect(isPlaceholderMode()).toBe(true);
    expect(isStripePlaceholderMode()).toBe(true);

    process.env.STRIPE_SECRET_KEY = 'sk_live_real';
    expect(isPlaceholderMode()).toBe(false);
  });

  it('coerces team seat counts into safe integers', () => {
    expect(getTeamSeatCount('5.9')).toBe(5);
    expect(getTeamSeatCount(-3)).toBe(1);
    expect(getTeamSeatCount('not-a-number')).toBe(10);
  });

  it('upserts subscriptions with timestamps and defaults', async () => {
    jest.useFakeTimers();
    const fixedNow = new Date('2024-04-01T00:00:00.000Z');
    jest.setSystemTime(fixedNow);
    const { values, onConflictDoUpdate } = mockInsertChain();

    try {
      await upsertTenantSubscription({ tenantId: 11, plan: 'pro', seats: 3 });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 11, plan: 'pro', seats: 3, createdAt: fixedNow, updatedAt: fixedNow })
      );
      expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ target: expect.anything() }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels subscriptions when a Stripe id is found', async () => {
    mockSelectWithLimit([{ id: 1, tenantId: 99 }]);
    const { where } = mockUpdateChain();

    await cancelTenantSubscriptionByStripeId('sub_456');

    expect(where).toHaveBeenCalled();
  });

  it('skips cancellation when no Stripe subscription found', async () => {
    mockSelectWithLimit([]);

    await cancelTenantSubscriptionByStripeId('missing');

    expect(mockedDb.update).not.toHaveBeenCalled();
  });
});
