import {
  buildUsageViewModel,
  type DateRangePreset,
} from '@/lib/usage-dashboard';

describe('usage dashboard view-model', () => {
  const baseNow = new Date('2026-03-02T12:00:00.000Z');

  function build(
    range: DateRangePreset,
    payload: Omit<Parameters<typeof buildUsageViewModel>[0], 'range' | 'now'>,
  ) {
    return buildUsageViewModel({
      ...payload,
      range,
      now: baseNow,
    });
  }

  it('builds charts and summary cards from complete payloads', () => {
    const view = build('30d', {
      summary: {
        rows: [
          { date: '2026-03-01', requests: 120, costUsd: 8.5, savedUsd: 2.1 },
          { date: '2026-03-02', requests: 140, costUsd: 9.75, savedUsd: 2.25 },
        ],
      },
      modelBreakdown: {
        rows: [
          { model: 'gpt-4o-mini', requests: 180, costUsd: 11.2 },
          { model: 'claude-3-5-sonnet', requests: 80, costUsd: 7.05 },
        ],
      },
      providerBreakdown: {
        rows: [
          { provider: 'openai', requests: 180, costUsd: 11.2 },
          { provider: 'anthropic', requests: 80, costUsd: 7.05 },
        ],
      },
      savings: {
        totalSavedUsd: 4.35,
        savingsPercent: 18.2,
        budgetLimitUsd: 30,
      },
    });

    expect(view.dateRangeDays).toBe(30);
    expect(view.totalRequestsMonth).toBe(260);
    expect(view.totalCostMonth).toBeCloseTo(18.25, 6);
    expect(view.totalSavedMonth).toBeCloseTo(4.35, 6);
    expect(view.savedPercentBadge).toBeCloseTo(18.2, 6);
    expect(view.budget).toEqual({
      hasLimit: true,
      limitUsd: 30,
      remainingUsd: 11.75,
    });
    expect(view.dailySeries).toEqual([
      { day: '2026-03-01', requests: 120, costUsd: 8.5, directCostUsd: 10.6 },
      { day: '2026-03-02', requests: 140, costUsd: 9.75, directCostUsd: 12 },
    ]);
    expect(view.modelBreakdown[0]).toEqual({
      name: 'gpt-4o-mini',
      value: 180,
      costUsd: 11.2,
    });
    expect(view.providerBreakdown[1]).toEqual({
      name: 'anthropic',
      value: 80,
      costUsd: 7.05,
    });
  });

  it('falls back to zeroed values for invalid payload shapes', () => {
    const view = build('7d', {
      summary: null,
      modelBreakdown: { rows: [{ model: '', requests: 'bad' }] },
      providerBreakdown: { rows: [{ provider: null, requests: undefined }] },
      savings: { totalSavedUsd: 'oops', savingsPercent: 'nope' },
    });

    expect(view.dateRangeDays).toBe(7);
    expect(view.totalRequestsMonth).toBe(0);
    expect(view.totalCostMonth).toBe(0);
    expect(view.totalSavedMonth).toBe(0);
    expect(view.savedPercentBadge).toBe(0);
    expect(view.dailySeries).toEqual([]);
    expect(view.modelBreakdown).toEqual([{ name: 'Unknown', value: 0, costUsd: 0 }]);
    expect(view.providerBreakdown).toEqual([{ name: 'Unknown', value: 0, costUsd: 0 }]);
    expect(view.budget).toEqual({ hasLimit: false, limitUsd: null, remainingUsd: null });
  });

  it('clamps budget remaining at zero when monthly cost exceeds the limit', () => {
    const view = build('90d', {
      summary: {
        rows: [
          { date: '2026-03-01', requests: 100, costUsd: 17.5, savedUsd: 1.5 },
        ],
      },
      modelBreakdown: { rows: [] },
      providerBreakdown: { rows: [] },
      savings: {
        totalSavedUsd: 1.5,
        savingsPercent: 7.8,
        budgetLimitUsd: 10,
      },
    });

    expect(view.dateRangeDays).toBe(90);
    expect(view.totalCostMonth).toBeCloseTo(17.5, 6);
    expect(view.budget).toEqual({
      hasLimit: true,
      limitUsd: 10,
      remainingUsd: 0,
    });
  });
});
