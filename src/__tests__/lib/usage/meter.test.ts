import { db } from '@/lib/db';
import { getTenantPlan } from '@/lib/billing';
import { recordUsage } from '@/lib/usage/meter';

jest.mock('@/lib/db', () => ({
  db: {
    insert: jest.fn(),
  },
}));

jest.mock('@/lib/billing', () => ({
  getTenantPlan: jest.fn(),
}));

type MockDb = {
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedGetTenantPlan = getTenantPlan as jest.MockedFunction<typeof getTenantPlan>;

function createLedgerInsertBuilder() {
  const values = jest.fn().mockResolvedValue(undefined);
  return { values };
}

function createSummaryInsertBuilder() {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  return { values, onConflictDoUpdate };
}

describe('usage meter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetTenantPlan.mockResolvedValue('free');
  });

  it('records ledger data and upserts daily/monthly summary rows', async () => {
    mockedGetTenantPlan.mockResolvedValueOnce('pro');

    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();

    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    const headers = new Headers({
      'X-AiPipe-Model': 'gpt-4o',
      'X-AiPipe-Provider': 'openai',
      'X-AiPipe-Tokens-In': '1000',
      'X-AiPipe-Tokens-Out': '250',
      'X-AiPipe-Cost-USD': '1.25',
      'X-AiPipe-Hypothetical-Cost-USD': '1.90',
      'X-AiPipe-Saved-USD': '0.65',
      'X-AiPipe-Cache': 'hit',
      'X-AiPipe-Request-Id': 'req_123',
    });

    await recordUsage(42, headers);

    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        model: 'gpt-4o',
        provider: 'openai',
        tokensIn: 1000,
        tokensOut: 250,
        costUsd: '1.250000',
        tenantCostUsd: '1.500000',
        hypotheticalCostUsd: '1.900000',
        savedUsd: '0.650000',
        cacheHit: true,
        requestId: 'req_123',
      }),
    );

    expect(dailySummaryInsert.values).toHaveBeenCalledTimes(1);
    expect(dailySummaryInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(monthlySummaryInsert.values).toHaveBeenCalledTimes(1);
    expect(monthlySummaryInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not throw when AiPipe headers are missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();
    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    await expect(recordUsage(7, new Headers())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
