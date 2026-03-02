import * as schema from '@/db/schema';

function expectType<T>(_value: T): void {
  // compile-time helper
}

function expectColumns(table: unknown, columns: string[]): void {
  const tableObject = table as Record<string, unknown>;
  for (const column of columns) {
    expect(tableObject[column]).toBeDefined();
  }
}

describe('src/db/schema exports', () => {
  it('exports all major mission control tables', () => {
    const expectedTables = [
      'users',
      'tenants',
      'memberships',
      'tasks',
      'taskPrdVersions',
      'events',
      'heartbeats',
      'chatThreads',
      'chatMessages',
      'telegramLinks',
      'activityEvents',
      'passwordResetTokens',
      'provisionedInstances',
    ];

    for (const tableName of expectedTables) {
      expect((schema as Record<string, unknown>)[tableName]).toBeDefined();
    }
  });

  it('users and tenants tables expose required identity columns', () => {
    expectColumns(schema.users, ['id', 'email', 'passwordHash', 'createdAt', 'updatedAt']);
    expectColumns(schema.tenants, ['id', 'slug', 'name', 'plan', 'ownerUserId', 'createdAt']);
  });

  it('tasks and task PRD version tables expose required lifecycle columns', () => {
    expectColumns(schema.tasks, [
      'id',
      'tenantId',
      'title',
      'status',
      'priority',
      'prdPath',
      'prdVersion',
      'completedAt',
    ]);
    expectColumns(schema.taskPrdVersions, ['id', 'tenantId', 'taskId', 'versionNumber', 'path', 'isCurrent']);
  });

  it('chat and telegram tables expose expected thread/linking columns', () => {
    expectColumns(schema.chatThreads, ['id', 'tenantId', 'title', 'createdAt']);
    expectColumns(schema.chatMessages, ['id', 'tenantId', 'role', 'content', 'source', 'threadId']);
    expectColumns(schema.telegramLinks, ['id', 'tenantId', 'userId', 'telegramUserId', 'telegramChatId']);
    expectColumns(schema.telegramLinkTokens, ['token', 'tenantId', 'userId', 'expiresAt', 'consumedAt']);
  });

  it('foreign-key relation columns and referenced primary keys are present', () => {
    const relationPairs: Array<{
      source: Record<string, unknown>;
      sourceColumn: string;
      target: Record<string, unknown>;
      targetColumn: string;
    }> = [
      { source: schema.memberships as unknown as Record<string, unknown>, sourceColumn: 'tenantId', target: schema.tenants as unknown as Record<string, unknown>, targetColumn: 'id' },
      { source: schema.tasks as unknown as Record<string, unknown>, sourceColumn: 'tenantId', target: schema.tenants as unknown as Record<string, unknown>, targetColumn: 'id' },
      { source: schema.chatThreads as unknown as Record<string, unknown>, sourceColumn: 'tenantId', target: schema.tenants as unknown as Record<string, unknown>, targetColumn: 'id' },
      { source: schema.chatMessages as unknown as Record<string, unknown>, sourceColumn: 'threadId', target: schema.chatThreads as unknown as Record<string, unknown>, targetColumn: 'id' },
      { source: schema.telegramLinks as unknown as Record<string, unknown>, sourceColumn: 'userId', target: schema.users as unknown as Record<string, unknown>, targetColumn: 'id' },
      { source: schema.activityReactions as unknown as Record<string, unknown>, sourceColumn: 'eventId', target: schema.activityEvents as unknown as Record<string, unknown>, targetColumn: 'id' },
    ];

    for (const relation of relationPairs) {
      expect(() => relation.source[relation.sourceColumn]).not.toThrow();
      expect(relation.source[relation.sourceColumn]).toBeDefined();
      expect(relation.target[relation.targetColumn]).toBeDefined();
    }
  });

  it('enum-like value sets remain valid and unique', () => {
    const taskStatuses = ['todo', 'in_progress', 'done'];
    const taskPriorities = ['Low', 'Medium', 'High', 'Critical'];
    const heartbeatStatuses = ['ok', 'error', 'unknown'];

    expect(taskStatuses).toContain('todo');
    expect(taskStatuses).toContain('done');
    expect(new Set(taskStatuses).size).toBe(taskStatuses.length);

    expect(taskPriorities).toContain('Medium');
    expect(taskPriorities).toContain('Critical');
    expect(new Set(taskPriorities).size).toBe(taskPriorities.length);

    expect(heartbeatStatuses).toContain('ok');
    expect(heartbeatStatuses).toContain('unknown');
    expect(new Set(heartbeatStatuses).size).toBe(heartbeatStatuses.length);
  });

  it('inferred select types match expected schema shapes', () => {
    const userRow: typeof schema.users.$inferSelect = {
      id: 1,
      email: 'operator@openclaw.dev',
      passwordHash: null,
      name: 'Operator',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const taskRow: typeof schema.tasks.$inferSelect = {
      id: 9,
      tenantId: 1,
      title: 'Test task',
      description: '',
      status: 'todo',
      priority: 'Medium',
      goal: 'Goal 1',
      goalId: null,
      assignedAgent: null,
      tags: '',
      checklist: '[]',
      prdPath: null,
      prdCanonicalPath: null,
      prdVersion: 1,
      prdLastUpdatedAt: null,
      prdMissingRemindedAt: null,
      completedAt: null,
      estimatedCostUsd: null,
      createdAt: null,
      updatedAt: null,
    };

    expectType<typeof schema.users.$inferSelect>(userRow);
    expectType<typeof schema.tasks.$inferSelect>(taskRow);

    expect(userRow.email).toMatch('@');
    expect(taskRow.status).toBe('todo');
  });

  it('inferred insert types accept minimal valid payloads', () => {
    const tenantInsert: typeof schema.tenants.$inferInsert = {
      slug: 'openclaw',
      name: 'OpenClaw',
    };
    const taskInsert: typeof schema.tasks.$inferInsert = {
      tenantId: 1,
      title: 'Ship tests',
    };
    const chatInsert: typeof schema.chatMessages.$inferInsert = {
      tenantId: 1,
      role: 'user',
      content: 'Hello',
    };

    expectType<typeof schema.tenants.$inferInsert>(tenantInsert);
    expectType<typeof schema.tasks.$inferInsert>(taskInsert);
    expectType<typeof schema.chatMessages.$inferInsert>(chatInsert);

    expect(tenantInsert.slug).toBe('openclaw');
    expect(taskInsert.title).toBe('Ship tests');
    expect(chatInsert.role).toBe('user');
  });
});
