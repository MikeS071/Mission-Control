import { db } from '@/lib/db';
import { openclawGatewayCall } from '@/lib/openclaw-gateway-cli';
import {
  bumpThreadUpdatedAt,
  getOrCreateDefaultThreadId,
  isThreadOwnedByTenant,
  resolveThreadId,
} from '@/lib/chat-threads';
import { postAssistantMessage } from '@/lib/chat-system';
import { openclawChatHistory, openclawChatSend } from '@/lib/openclaw-chat';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/openclaw-gateway-cli', () => ({
  openclawGatewayCall: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedGateway = openclawGatewayCall as jest.MockedFunction<typeof openclawGatewayCall>;

function mockSelectReturning(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ limit, orderBy });
  const from = jest.fn().mockReturnValue({ where, orderBy, limit });
  mockedDb.select.mockReturnValueOnce({ from } as unknown);
  return { from, where, orderBy, limit };
}

function mockInsertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values } as unknown);
  return { values, returning };
}

function mockInsertValuesResolved() {
  const values = jest.fn().mockResolvedValue(undefined);
  mockedDb.insert.mockReturnValueOnce({ values } as unknown);
  return { values };
}

function mockUpdateResolved() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set } as unknown);
  return { set, where };
}

describe('chat thread helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing oldest thread id when present', async () => {
    const { orderBy } = mockSelectReturning([{ id: 31 }]);

    await expect(getOrCreateDefaultThreadId(8)).resolves.toBe(31);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('creates a Main thread when tenant has none', async () => {
    mockSelectReturning([]);
    const { values, returning } = mockInsertReturning([{ id: 77 }]);

    await expect(getOrCreateDefaultThreadId(8)).resolves.toBe(77);
    expect(values).toHaveBeenCalledWith({ tenantId: 8, title: 'Main' });
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it('checks thread ownership for tenant', async () => {
    mockSelectReturning([{ id: 99 }]);
    await expect(isThreadOwnedByTenant(1, 99)).resolves.toBe(true);

    mockSelectReturning([]);
    await expect(isThreadOwnedByTenant(1, 99)).resolves.toBe(false);
  });

  it('resolves invalid thread id input to tenant default thread', async () => {
    mockSelectReturning([{ id: 5 }]);

    await expect(resolveThreadId(4, 'not-a-number')).resolves.toBe(5);
  });

  it('uses provided thread id when it is owned by tenant', async () => {
    mockSelectReturning([{ id: 12 }]);

    await expect(resolveThreadId(2, '12')).resolves.toBe(12);
  });

  it('falls back to default thread when provided thread is not owned', async () => {
    mockSelectReturning([]);
    mockSelectReturning([{ id: 44 }]);

    await expect(resolveThreadId(2, 12)).resolves.toBe(44);
  });

  it('swallows update errors while bumping thread timestamp', async () => {
    const where = jest.fn().mockRejectedValue(new Error('db down'));
    const set = jest.fn().mockReturnValue({ where });
    mockedDb.update.mockReturnValueOnce({ set } as unknown);

    await expect(bumpThreadUpdatedAt(12)).resolves.toBeUndefined();
  });
});

describe('chat system message helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores assistant message and bumps thread state', async () => {
    mockSelectReturning([{ id: 222 }]);
    const { values } = mockInsertValuesResolved();
    const { set } = mockUpdateResolved();

    await postAssistantMessage(3, 'System ready.');

    expect(values).toHaveBeenCalledWith({
      tenantId: 3,
      role: 'assistant',
      content: 'System ready.',
      source: 'mc',
      threadId: 222,
    });
    expect(set).toHaveBeenCalledWith({ updatedAt: expect.any(Date) });
  });
});

describe('openclaw chat integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normalized message history and filters internal/system entries', async () => {
    mockedGateway.mockResolvedValueOnce({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: 1000 },
        { role: 'assistant', content: [{ type: 'text', text: 'world' }, { type: 'toolCall', name: 'noop' }], timestamp: 1001 },
        { role: 'system', content: [{ type: 'text', text: 'hidden system text' }], timestamp: 1002 },
        { role: 'user', content: [{ type: 'text', text: '[[mc:guard]] hidden user instruction' }], timestamp: 1003 },
        { role: 'assistant', content: [{ type: 'toolResult', value: 'ignored' }], timestamp: 1004 },
        { role: 'assistant', content: [{ type: 'text', text: '   ' }], timestamp: 1005 },
        { role: 'assistant', content: [{ type: 'text', text: 'fallback timestamp' }], timestamp: 'bad-ts' },
      ],
    });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(424242);

    try {
      const result = await openclawChatHistory({ tenantId: 9, convId: 'conv-1', limit: 500 });

      expect(mockedGateway).toHaveBeenCalledWith(
        'chat.history',
        { sessionKey: 'agent:main:webchat:tenant:9:conv:conv-1', limit: 200 },
        { timeoutMs: 30_000 },
      );
      expect(result.messages).toEqual([
        { role: 'user', text: 'hello', timestamp: 1000 },
        { role: 'assistant', text: 'world', timestamp: 1001 },
        { role: 'assistant', text: 'fallback timestamp', timestamp: 424242 },
      ]);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('clamps history limit and uses base tenant session key when convId is missing', async () => {
    mockedGateway.mockResolvedValueOnce({ messages: [] });

    await openclawChatHistory({ tenantId: 6, limit: 0 });

    expect(mockedGateway).toHaveBeenCalledWith(
      'chat.history',
      { sessionKey: 'agent:main:webchat:tenant:6', limit: 1 },
      { timeoutMs: 30_000 },
    );
  });

  it('sends wrapped user messages via gateway and returns run metadata', async () => {
    mockedGateway.mockResolvedValueOnce({ runId: 'run-1', status: 'queued' });

    const response = await openclawChatSend({
      tenantId: 5,
      convId: null,
      message: 'Tell me status',
      idempotencyKey: 'idem-1',
    });

    expect(mockedGateway).toHaveBeenCalledWith(
      'chat.send',
      expect.objectContaining({
        sessionKey: 'agent:main:webchat:tenant:5',
        idempotencyKey: 'idem-1',
        deliver: false,
      }),
      { timeoutMs: 30_000 },
    );
    expect(mockedGateway.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('[[mc:guard]]'),
      }),
    );
    expect(response).toEqual({ runId: 'run-1', status: 'queued' });
  });

  it('preserves pre-wrapped MC messages when sending', async () => {
    mockedGateway.mockResolvedValueOnce({ runId: 'run-2', status: 'accepted' });

    await openclawChatSend({
      tenantId: 5,
      convId: 'thread-7',
      message: '   [[mc:custom]] already wrapped',
      idempotencyKey: 'idem-2',
    });

    expect(mockedGateway.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        message: '   [[mc:custom]] already wrapped',
        sessionKey: 'agent:main:webchat:tenant:5:conv:thread-7',
      }),
    );
  });

  it('surfaces disconnected-state errors from the chat transport', async () => {
    mockedGateway.mockRejectedValueOnce(new Error('OpenClaw WS disconnected'));

    await expect(
      openclawChatSend({
        tenantId: 10,
        convId: 'conv-ws',
        message: 'ping',
        idempotencyKey: 'idem-ws',
      }),
    ).rejects.toThrow('OpenClaw WS disconnected');
  });
});
