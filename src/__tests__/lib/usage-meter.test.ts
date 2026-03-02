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

function createHeaders(overrides: Record<string, string> = {}) {
  const headers = new Headers({
    'X-AiPipe-Model': 'gpt-4o-mini',
    'X-AiPipe-Provider': 'openai',
    'X-AiPipe-Tokens-In': '120',
    'X-AiPipe-Tokens-Out': '80',
    'X-AiPipe-Cost-USD': '0.0234',
    'X-AiPipe-Hypothetical-Cost-USD': '0.0520',
    'X-AiPipe-Saved-USD': '0.0286',
    'X-AiPipe-Cache': 'hit',
    'X-AiPipe-Request-Id': 'req-abc-123',
    ...overrides,
  });
  return headers;
}

describe('usage meter compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTenantPlan.mockResolvedValue('free');
  });

  it('records ledger and summary usage rows', async () => {
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();

    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    await expect(recordUsage(77, createHeaders())).resolves.toBeUndefined();

    expect(mockedDb.insert).toHaveBeenCalledTimes(3);
    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 77,
        model: 'gpt-4o-mini',
        provider: 'openai',
        tokensIn: 120,
        tokensOut: 80,
        requestId: 'req-abc-123',
      }),
    );
    expect(dailySummaryInsert.values).toHaveBeenCalledTimes(1);
    expect(monthlySummaryInsert.values).toHaveBeenCalledTimes(1);
  });

  it('logs missing header warnings but still records with defaults', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();

    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    await expect(recordUsage(77, new Headers())).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(mockedDb.insert).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it('tolerates invalid numeric headers by coercing to zero values', async () => {
    const ledgerInsert = createLedgerInsertBuilder();
    const dailySummaryInsert = createSummaryInsertBuilder();
    const monthlySummaryInsert = createSummaryInsertBuilder();

    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(dailySummaryInsert)
      .mockReturnValueOnce(monthlySummaryInsert);

    await expect(recordUsage(77, createHeaders({ 'X-AiPipe-Tokens-In': 'not-a-number' }))).resolves.toBeUndefined();

    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tokensIn: 0,
      }),
    );
  });
});
