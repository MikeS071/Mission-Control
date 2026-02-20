import { updateStreakForActivity } from '@/lib/streak';
import { db } from '@/lib/db';
import { awardXp, XP_RULES } from '@/lib/xp';

type MockDb = jest.Mocked<typeof db>;

type MockAwardXp = jest.MockedFunction<typeof awardXp>;

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/xp', () => ({
  awardXp: jest.fn(),
  XP_RULES: { STREAK_BONUS: 5 },
}));

const mockedDb = db as MockDb;
const mockedAwardXp = awardXp as MockAwardXp;

describe('streak helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  function createSelectBuilder(rows: any[]) {
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    return { from } as any;
  }

  function createInsertBuilder(returnRows: any[]) {
    const returning = jest.fn().mockResolvedValue(returnRows);
    const values = jest.fn().mockReturnValue({ returning });
    return { values, returning } as any;
  }

  function createUpdateBuilder(returnRows: any[]) {
    const returning = jest.fn().mockResolvedValue(returnRows);
    const where = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where });
    return { set, where, returning } as any;
  }

  it('creates a new streak and awards bonus when none exist', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-10T00:00:00.000Z');
    jest.setSystemTime(today);

    mockedDb.select.mockReturnValueOnce(createSelectBuilder([]));
    const insertBuilder = createInsertBuilder([
      {
        tenantId: 1,
        userEmail: 'user@example.com',
        currentStreak: 1,
        longestStreak: 1,
      },
    ]);
    mockedDb.insert.mockReturnValueOnce(insertBuilder);

    const result = await updateStreakForActivity(1, 'user@example.com');

    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 1, userEmail: 'user@example.com', currentStreak: 1 })
    );
    expect(result).toEqual({ currentStreak: 1, longestStreak: 1, awardedBonus: true });
    expect(mockedAwardXp).toHaveBeenCalledWith(1, XP_RULES.STREAK_BONUS, 'streak_bonus', '2024-05-10');
  });

  it('returns existing streak data without awarding bonus on same-day activity', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-11T00:00:00.000Z');
    jest.setSystemTime(today);

    const existingRow = {
      id: 5,
      tenantId: 1,
      userEmail: 'user@example.com',
      currentStreak: 4,
      longestStreak: 6,
      lastActivityDate: '2024-05-11',
    };
    mockedDb.select.mockReturnValueOnce(createSelectBuilder([existingRow]));

    const result = await updateStreakForActivity(1, 'user@example.com');

    expect(result).toEqual({ currentStreak: 4, longestStreak: 6, awardedBonus: false });
    expect(mockedAwardXp).not.toHaveBeenCalled();
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('increments streaks across days and records a bonus', async () => {
    jest.useFakeTimers();
    const today = new Date('2024-05-12T00:00:00.000Z');
    jest.setSystemTime(today);

    const existingRow = {
      id: 9,
      tenantId: 3,
      userEmail: 'user@example.com',
      currentStreak: 2,
      longestStreak: 4,
      lastActivityDate: '2024-05-11',
    };
    mockedDb.select.mockReturnValueOnce(createSelectBuilder([existingRow]));
    const updateBuilder = createUpdateBuilder([
      {
        currentStreak: 3,
        longestStreak: 4,
      },
    ]);
    mockedDb.update.mockReturnValueOnce(updateBuilder);

    const result = await updateStreakForActivity(3, 'user@example.com');

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ currentStreak: 3, longestStreak: 4, lastActivityDate: '2024-05-12' })
    );
    expect(result).toEqual({ currentStreak: 3, longestStreak: 4, awardedBonus: true });
    expect(mockedAwardXp).toHaveBeenCalledWith(3, XP_RULES.STREAK_BONUS, 'streak_bonus', '2024-05-12');
  });
});
