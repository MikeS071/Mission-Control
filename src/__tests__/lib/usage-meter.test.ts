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

function createValidAiPipeHeaders() {
  const headers = new Headers();
  headers.set('X-AiPipe-Model', 'gpt-4o-mini');
  headers.set('X-AiPipe-Provider', 'openai');
  headers.set('X-AiPipe-Tokens-In', '120');
  headers.set('X-AiPipe-Tokens-Out', '80');
  headers.set('X-AiPipe-Cost-USD', '0.0234');
  headers.set('X-AiPipe-Hypothetical-Cost-USD', '0.0520');
  headers.set('X-AiPipe-Saved-USD', '0.0286');
  headers.set('X-AiPipe-Cache', 'hit');
  headers.set('X-AiPipe-Request-Id', 'req-abc-123');
  return headers;
}

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
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetTenantPlan.mockResolvedValue('free');
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('records ledger entry and upserts daily/monthly usage summaries', async () => {
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();
    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    await expect(recordUsage(77, createValidAiPipeHeaders())).resolves.toBeUndefined();

    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 77,
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensIn: 120,
        tokensOut: 80,
        costUsd: '0.023400',
        tenantCostUsd: expect.any(String),
        hypotheticalCostUsd: '0.052000',
        savedUsd: '0.028600',
        cacheHit: true,
        requestId: 'req-abc-123',
      }),
    );
    expect(dailySummaryInsert.values).toHaveBeenCalledTimes(1);
    expect(dailySummaryInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(monthlySummaryInsert.values).toHaveBeenCalledTimes(1);
    expect(monthlySummaryInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('warns but still records defaults when required headers are missing', async () => {
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();
    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    const partialHeaders = new Headers();
    partialHeaders.set('X-AiPipe-Model', 'gpt-4o-mini');
    partialHeaders.set('X-AiPipe-Provider', 'openai');

    await expect(recordUsage(77, partialHeaders)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith('[usage] Missing AiPipe headers:', expect.any(String));
    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 77,
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensIn: 0,
        tokensOut: 0,
      }),
    );
  });

  it('coerces invalid numeric headers to zero without throwing', async () => {
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();
    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    const headers = createValidAiPipeHeaders();
    headers.set('X-AiPipe-Tokens-In', 'not-a-number');
    headers.set('X-AiPipe-Cost-USD', 'nan');

    await expect(recordUsage(77, headers)).resolves.toBeUndefined();

    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tokensIn: 0,
        costUsd: '0.000000',
      }),
    );
  });
});
