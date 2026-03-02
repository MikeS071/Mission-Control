import { db } from '@/lib/db';
import { UNLIMITED_BUDGET, checkBudget } from '@/lib/usage/budget';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

type MockDb = {
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

describe('usage budget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests when usage is below api_calls_per_day limit', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            tier: 'free',
            rules: [
              {
                featureKey: 'api_calls_per_day',
                limitType: 'number',
                limitValue: 100,
                enabled: true,
              },
            ],
            customOverrides: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ used: 37 }],
      });

    await expect(checkBudget(7)).resolves.toEqual({
      allowed: true,
      remaining: 63,
      limit: 100,
      period: 'daily',
    });
  });

  it('denies requests when usage is at the budget limit', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({
        rows: [
          {
            tier: 'pro',
            rules: [
              {
                featureKey: 'api_calls_per_day',
                limitType: 'number',
                limitValue: 50,
                enabled: true,
              },
            ],
            customOverrides: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ used: 50 }],
      });

    await expect(checkBudget(7)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      limit: 50,
      period: 'daily',
    });
  });

  it('defaults to unlimited budget when no policy exists', async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [] });

    await expect(checkBudget(7)).resolves.toEqual({
      allowed: true,
      remaining: UNLIMITED_BUDGET,
      limit: UNLIMITED_BUDGET,
      period: 'unlimited',
    });
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });
});
