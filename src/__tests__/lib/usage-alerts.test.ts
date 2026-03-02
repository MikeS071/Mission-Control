import { db } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

import { checkAlerts } from '@/lib/usage/alerts';

type MockDb = {
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;

describe('usage alerts library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates warning and critical alerts when thresholds are crossed', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ settings: { tokenLimitMonthly: 1000 } }] })
      .mockResolvedValueOnce({ rows: [{ total_tokens: '950' }] })
      .mockResolvedValueOnce({ rows: [{ tokens: 400 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 11, tenant_id: 7, alert_type: 'budget_warning', threshold: 75, message: '75% threshold reached', acknowledged: false, created_at: new Date('2026-03-02T00:00:00.000Z') }] })
      .mockResolvedValueOnce({ rows: [{ id: 12, tenant_id: 7, alert_type: 'budget_critical', threshold: 90, message: '90% threshold reached', acknowledged: false, created_at: new Date('2026-03-02T00:00:00.000Z') }] });

    const alerts = await checkAlerts(7);

    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.threshold)).toEqual([75, 90]);
    expect(alerts.map((alert) => alert.alertType)).toEqual(['budget_warning', 'budget_critical']);
  });

  it('does not create duplicate alerts for thresholds already alerted in the current period', async () => {
    mockedDb.execute
      .mockResolvedValueOnce({ rows: [{ settings: { tokenLimitMonthly: 1000 } }] })
      .mockResolvedValueOnce({ rows: [{ total_tokens: '980' }] })
      .mockResolvedValueOnce({ rows: [{ tokens: 300 }] })
      .mockResolvedValueOnce({ rows: [{ threshold: 75 }] })
      .mockResolvedValueOnce({ rows: [{ id: 13, tenant_id: 7, alert_type: 'budget_critical', threshold: 90, message: '90% threshold reached', acknowledged: false, created_at: new Date('2026-03-02T00:00:00.000Z') }] });

    const alerts = await checkAlerts(7);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.threshold).toBe(90);
    expect(alerts[0]?.alertType).toBe('budget_critical');
    expect(mockedDb.execute).toHaveBeenCalledTimes(5);
  });

  it('returns no alerts when no monthly budget is configured', async () => {
    mockedDb.execute.mockResolvedValueOnce({ rows: [{ settings: {} }] });

    const alerts = await checkAlerts(7);

    expect(alerts).toEqual([]);
    expect(mockedDb.execute).toHaveBeenCalledTimes(1);
  });
});
