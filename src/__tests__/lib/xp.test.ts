import { awardXp, getTenantTotalXp, getChallengeById, XP_RULES } from '@/lib/xp';
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

describe('xp helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  type SelectOptions = { withLimit?: boolean };

  function createSelectBuilder(rows: any[], options: SelectOptions = {}) {
    if (options.withLimit === false) {
      const where = jest.fn().mockReturnValue(Promise.resolve(rows));
      const from = jest.fn().mockReturnValue({ where });
      return { from } as any;
    }
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    return { from } as any;
  }

  function createInsertBuilder(resolvedValue: unknown = []) {
    const returning = jest.fn().mockResolvedValue(resolvedValue);
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const thenable = {
      returning,
      onConflictDoUpdate,
      then: (resolve: (value: unknown) => void) => resolve(resolvedValue),
    };
    const values = jest.fn().mockReturnValue(thenable);
    return { values, returning, onConflictDoUpdate } as any;
  }

  function createUpdateBuilder() {
    const whereResult = { then: (resolve: (value: unknown) => void) => resolve(undefined) };
    const where = jest.fn().mockReturnValue(whereResult);
    const set = jest.fn().mockReturnValue({ where });
    return { set, where } as any;
  }

  it('awards xp and creates a streak when no history exists', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-01T00:00:00.000Z');
    jest.setSystemTime(today);

    mockedDb.select.mockReturnValueOnce(createSelectBuilder([]));
    const ledgerInsert = createInsertBuilder();
    const streakInsert = createInsertBuilder();
    const bonusInsert = createInsertBuilder();
    mockedDb.insert
      .mockReturnValueOnce(ledgerInsert)
      .mockReturnValueOnce(streakInsert)
      .mockReturnValueOnce(bonusInsert);

    await awardXp(5, 10, 'task_completed', 'task-1');

    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5, points: 10, reason: 'task_completed', refId: 'task-1' })
    );
    expect(streakInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5, currentStreak: 1, longestStreak: 1, lastActivityDate: '2024-05-01' })
    );
    expect(bonusInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'streak_bonus', points: XP_RULES.STREAK_BONUS })
    );
  });

  it('skips streak bonus when activity already recorded today', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-02T00:00:00.000Z');
    jest.setSystemTime(today);

    mockedDb.select.mockReturnValueOnce(
      createSelectBuilder([
        { id: 1, tenantId: 5, userEmail: 'system', currentStreak: 3, longestStreak: 4, lastActivityDate: '2024-05-02' },
      ])
    );
    const ledgerInsert = createInsertBuilder();
    mockedDb.insert.mockReturnValueOnce(ledgerInsert);

    await awardXp(5, 2, 'task_created');

    expect(ledgerInsert.values).toHaveBeenCalledTimes(1);
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('increments streak and adds bonus when activity resumes next day', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-03T00:00:00.000Z');
    jest.setSystemTime(today);

    mockedDb.select.mockReturnValueOnce(
      createSelectBuilder([
        { id: 7, tenantId: 5, userEmail: 'system', currentStreak: 2, longestStreak: 3, lastActivityDate: '2024-05-02' },
      ])
    );

    const ledgerInsert = createInsertBuilder();
    const bonusInsert = createInsertBuilder();
    const updateBuilder = createUpdateBuilder();
    mockedDb.insert.mockReturnValueOnce(ledgerInsert).mockReturnValueOnce(bonusInsert);
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    await awardXp(5, 7, 'task_completed');

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ currentStreak: 3, longestStreak: 3, lastActivityDate: '2024-05-03' })
    );
    expect(bonusInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ refId: '2024-05-03', points: XP_RULES.STREAK_BONUS })
    );
  });

  it('swallows errors emitted by the fire-and-forget helper', async () => {
    const failingInsert = { values: jest.fn(() => { throw new Error('fail'); }) } as any;
    mockedDb.insert.mockReturnValueOnce(failingInsert);

    await expect(awardXp(1, 1, 'oops')).resolves.toBeUndefined();
  });

  it('returns total xp aggregates even when DB rows are missing', async () => {
    mockedDb.select.mockReturnValueOnce(createSelectBuilder([{ totalXp: 37 }], { withLimit: false }));
    await expect(getTenantTotalXp(9)).resolves.toBe(37);

    mockedDb.select.mockReturnValueOnce(createSelectBuilder([], { withLimit: false }));
    await expect(getTenantTotalXp(9)).resolves.toBe(0);
  });

  it('fetches individual challenges when present', async () => {
    mockedDb.select.mockReturnValueOnce(createSelectBuilder([{ id: 5 }])).mockReturnValueOnce(createSelectBuilder([]));

    await expect(getChallengeById(1, 5)).resolves.toEqual({ id: 5 });
    await expect(getChallengeById(1, 5)).resolves.toBeNull();
  });
});
