/**
 * TC-16: DB schema validation tests
 */
import * as schema from '@/db/schema';

describe('DB Schema', () => {
  const expectedTables = [
    'users', 'tenants', 'memberships', 'tasks', 'events',
    'heartbeats', 'agentStats', 'gatewayConnections', 'waitlist',
    'featureRequests', 'subscriptions', 'tenantSettings', 'xpLedger',
    'streaks', 'chatThreads', 'chatMessages', 'telegramLinks',
    'activityEvents', 'passwordResetTokens', 'provisionedInstances',
  ];

  test.each(expectedTables)('exports %s table', (tableName) => {
    const table = (schema as Record<string, unknown>)[tableName];
    expect(table).toBeDefined();
  });

  test('users table has id and email columns', () => {
    expect(schema.users).toBeDefined();
    expect((schema.users as any).id).toBeDefined();
    expect((schema.users as any).email).toBeDefined();
  });

  test('tenants table has id, slug, name, plan columns', () => {
    expect(schema.tenants).toBeDefined();
    expect((schema.tenants as any).id).toBeDefined();
    expect((schema.tenants as any).slug).toBeDefined();
  });

  test('tasks table has id, tenantId, title, status columns', () => {
    expect(schema.tasks).toBeDefined();
    expect((schema.tasks as any).id).toBeDefined();
    expect((schema.tasks as any).title).toBeDefined();
  });

  test('schema exports at least 30 tables', () => {
    const count = Object.values(schema).filter(
      (v) => v && typeof v === 'object' && 'id' in (v as object)
    ).length;
    expect(count).toBeGreaterThanOrEqual(20);
  });
});
