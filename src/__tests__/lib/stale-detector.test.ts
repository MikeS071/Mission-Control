import { getStaleLevel, isStale } from '@/lib/kanban/staleDetector';

describe('staleDetector', () => {
  const originalAging = process.env.KANBAN_STALE_AGING_DAYS;
  const originalStale = process.env.KANBAN_STALE_DAYS;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
    delete process.env.KANBAN_STALE_AGING_DAYS;
    delete process.env.KANBAN_STALE_DAYS;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalAging === undefined) {
      delete process.env.KANBAN_STALE_AGING_DAYS;
    } else {
      process.env.KANBAN_STALE_AGING_DAYS = originalAging;
    }

    if (originalStale === undefined) {
      delete process.env.KANBAN_STALE_DAYS;
    } else {
      process.env.KANBAN_STALE_DAYS = originalStale;
    }
  });

  describe('isStale', () => {
    it('returns true when task update age is above threshold days', () => {
      const task = { updatedAt: new Date('2026-01-01T00:00:00.000Z') };

      expect(isStale(task, 7)).toBe(true);
    });

    it('returns false when task update age is exactly on threshold boundary', () => {
      const task = { updatedAt: new Date('2026-01-03T00:00:00.000Z') };

      expect(isStale(task, 7)).toBe(false);
    });

    it('returns false for invalid update timestamps instead of throwing', () => {
      const task = { updatedAt: new Date('invalid-date') };

      expect(isStale(task, 7)).toBe(false);
    });
  });

  describe('getStaleLevel', () => {
    it.each([
      ['fresh', '2026-01-09T12:00:00.000Z'],
      ['aging', '2026-01-07T00:00:00.000Z'],
      ['aging', '2026-01-03T00:00:00.000Z'],
      ['stale', '2026-01-02T00:00:00.000Z'],
    ] as const)('returns %s for updatedAt=%s using default thresholds', (expected, updatedAt) => {
      expect(getStaleLevel({ updatedAt: new Date(updatedAt) })).toBe(expected);
    });

    it('uses environment overrides for configurable thresholds', () => {
      process.env.KANBAN_STALE_AGING_DAYS = '1';
      process.env.KANBAN_STALE_DAYS = '2';

      expect(getStaleLevel({ updatedAt: new Date('2026-01-08T00:00:00.000Z') })).toBe('aging');
      expect(getStaleLevel({ updatedAt: new Date('2026-01-07T00:00:00.000Z') })).toBe('stale');
    });

    it('falls back to fresh for invalid update timestamps', () => {
      expect(getStaleLevel({ updatedAt: new Date('invalid-date') })).toBe('fresh');
    });
  });
});
