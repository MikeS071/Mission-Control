import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authorizeInbound } from '@/lib/policy';
import { bumpThreadUpdatedAt, getOrCreateDefaultThreadId } from '@/lib/chat-threads';
import { isMcTelegramBridgeEnabled } from '@/lib/telegram-ingress';
import { resolveTenantId } from '@/lib/tenant';
import { sendTelegramMessage } from '@/lib/telegram';
import { telegramSendChatAction, telegramSendMessage } from '@/lib/telegram-bot';
import { wsManager } from '@/lib/ws-manager';
import { POST as telegramRoutePost } from '@/app/api/telegram/route';
import { POST as linkTokenPost } from '@/app/api/telegram/link-token/route';
import { POST as disconnectPost } from '@/app/api/telegram/disconnect/route';
import { GET as updatesGet } from '@/app/api/telegram/updates/route';
import { POST as webhookPost } from '@/app/api/telegram/webhook/route';

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ and: args })),
  desc: jest.fn((value: unknown) => ({ desc: value })),
  eq: jest.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  isNull: jest.fn((value: unknown) => ({ isNull: value })),
}));

jest.mock('@/db/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
  },
  chatMessages: {
    id: 'chat_messages.id',
    createdAt: 'chat_messages.created_at',
  },
  telegramLinks: {
    id: 'telegram_links.id',
    tenantId: 'telegram_links.tenant_id',
    userId: 'telegram_links.user_id',
    telegramUserId: 'telegram_links.telegram_user_id',
    telegramChatId: 'telegram_links.telegram_chat_id',
    revokedAt: 'telegram_links.revoked_at',
  },
  telegramLinkTokens: {
    token: 'telegram_link_tokens.token',
    consumedAt: 'telegram_link_tokens.consumed_at',
  },
  telegramUpdates: {
    updateId: 'telegram_updates.update_id',
    tenantId: 'telegram_updates.tenant_id',
    status: 'telegram_updates.status',
    error: 'telegram_updates.error',
    receivedAt: 'telegram_updates.received_at',
    processedAt: 'telegram_updates.processed_at',
    telegramUserId: 'telegram_updates.telegram_user_id',
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

jest.mock('@/lib/telegram', () => ({
  sendTelegramMessage: jest.fn(),
}));

jest.mock('@/lib/telegram-bot', () => ({
  telegramSendChatAction: jest.fn(),
  telegramSendMessage: jest.fn(),
}));

jest.mock('@/lib/policy', () => ({
  authorizeInbound: jest.fn(),
}));

jest.mock('@/lib/telegram-ingress', () => ({
  isMcTelegramBridgeEnabled: jest.fn(),
}));

jest.mock('@/lib/ws-manager', () => ({
  wsManager: {
    broadcast: jest.fn(),
  },
}));

jest.mock('@/lib/chat-threads', () => ({
  bumpThreadUpdatedAt: jest.fn(),
  getOrCreateDefaultThreadId: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedAuth = auth as unknown as jest.MockedFunction<() => Promise<unknown>>;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;
const mockedSendTelegramMessage = sendTelegramMessage as jest.MockedFunction<typeof sendTelegramMessage>;
const mockedTelegramSendMessage = telegramSendMessage as jest.MockedFunction<typeof telegramSendMessage>;
const mockedTelegramSendChatAction = telegramSendChatAction as jest.MockedFunction<typeof telegramSendChatAction>;
const mockedAuthorizeInbound = authorizeInbound as jest.MockedFunction<typeof authorizeInbound>;
const mockedIsBridgeEnabled = isMcTelegramBridgeEnabled as jest.MockedFunction<typeof isMcTelegramBridgeEnabled>;
const mockedGetOrCreateDefaultThreadId = getOrCreateDefaultThreadId as jest.MockedFunction<typeof getOrCreateDefaultThreadId>;
const mockedBumpThreadUpdatedAt = bumpThreadUpdatedAt as jest.MockedFunction<typeof bumpThreadUpdatedAt>;
const mockedBroadcast = wsManager.broadcast as jest.MockedFunction<typeof wsManager.broadcast>;

function makeRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && typeof body !== 'string' && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  const serializedBody = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
  return new Request(`http://localhost${path}`, {
    method,
    body: serializedBody,
    headers: requestHeaders,
  }) as unknown as NextRequest;
}

function mockSelectWhereLimitOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from } as unknown);
  return { from, where, limit };
}

function mockSelectWhereOrderByLimitOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from } as unknown);
  return { from, where, orderBy, limit };
}

function mockInsertValuesOnce(result: unknown = undefined) {
  const values = jest.fn().mockResolvedValue(result);
  mockedDb.insert.mockReturnValueOnce({ values } as unknown);
  return { values };
}

function mockInsertValuesReturningOnce(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values } as unknown);
  return { values, returning };
}

function mockUpdateSetWhereOnce(result: unknown = undefined) {
  const where = jest.fn().mockResolvedValue(result);
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set } as unknown);
  return { set, where };
}

describe('telegram api routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MC_TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
    delete process.env.TELEGRAM_BOT_USERNAME;

    mockedIsBridgeEnabled.mockReturnValue(true);
    mockedAuth.mockResolvedValue({ user: { email: 'user@example.com' } });
    mockedResolveTenantId.mockResolvedValue(1);
    mockedSendTelegramMessage.mockResolvedValue(undefined);
    mockedTelegramSendMessage.mockResolvedValue(undefined);
    mockedTelegramSendChatAction.mockResolvedValue(undefined);
    mockedAuthorizeInbound.mockResolvedValue({ allow: true });
    mockedGetOrCreateDefaultThreadId.mockResolvedValue(101);
    mockedBumpThreadUpdatedAt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.MC_TELEGRAM_WEBHOOK_SECRET;
  });

  describe('main route', () => {
    it('returns 400 when text is missing', async () => {
      const response = await telegramRoutePost(makeRequest('/api/telegram', 'POST', {}));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'text is required' });
      expect(mockedSendTelegramMessage).not.toHaveBeenCalled();
    });

    it('sends telegram message for valid text payload', async () => {
      const response = await telegramRoutePost(makeRequest('/api/telegram', 'POST', { text: 'Hello from tests' }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(mockedSendTelegramMessage).toHaveBeenCalledWith('Hello from tests');
    });

    it('returns 400 when text is whitespace-only', async () => {
      const response = await telegramRoutePost(makeRequest('/api/telegram', 'POST', { text: '   ' }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'text is required' });
    });
  });

  describe('link-token route', () => {
    it('returns 409 when bridge is disabled', async () => {
      mockedIsBridgeEnabled.mockReturnValue(false);

      const response = await linkTokenPost(makeRequest('/api/telegram/link-token', 'POST', {}));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'MC Telegram bridge is disabled (MC_TELEGRAM_INGRESS_MODE=openclaw).',
      });
    });

    it('returns 401 when tenant or session email is missing', async () => {
      mockedResolveTenantId.mockResolvedValue(null);

      const response = await linkTokenPost(makeRequest('/api/telegram/link-token', 'POST', {}));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when authenticated user is not found', async () => {
      mockSelectWhereLimitOnce([]);

      const response = await linkTokenPost(makeRequest('/api/telegram/link-token', 'POST', {}));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'User not found' });
    });

    it('creates token and deep-link for valid user context', async () => {
      process.env.TELEGRAM_BOT_USERNAME = 'missioncontrol_bot';
      mockSelectWhereLimitOnce([{ id: 42 }]);
      const insert = mockInsertValuesOnce();

      const response = await linkTokenPost(makeRequest('/api/telegram/link-token', 'POST', {}));
      const body = (await response.json()) as { token: string; deepLinkUrl: string | null; expiresAt: string };

      expect(response.status).toBe(200);
      expect(body.token).toMatch(/^[a-f0-9]{48}$/);
      expect(body.deepLinkUrl).toBe(`https://t.me/missioncontrol_bot?start=${body.token}`);
      expect(new Date(body.expiresAt).toString()).not.toBe('Invalid Date');
      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          token: body.token,
          tenantId: 1,
          userId: 42,
          expiresAt: expect.any(Date),
        })
      );
    });
  });

  describe('disconnect route', () => {
    it('returns 401 when user context is missing', async () => {
      mockedAuth.mockResolvedValueOnce(null);

      const response = await disconnectPost(makeRequest('/api/telegram/disconnect', 'POST', {}));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when authenticated user does not exist', async () => {
      mockSelectWhereLimitOnce([]);

      const response = await disconnectPost(makeRequest('/api/telegram/disconnect', 'POST', {}));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'User not found' });
    });

    it('revokes active link and returns ok', async () => {
      mockSelectWhereLimitOnce([{ id: 11 }]);
      const update = mockUpdateSetWhereOnce();

      const response = await disconnectPost(makeRequest('/api/telegram/disconnect', 'POST', {}));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
    });
  });

  describe('updates route', () => {
    it('returns 401 when auth guard fails', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const response = await updatesGet(makeRequest('/api/telegram/updates', 'GET'));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('clamps requested limit to max 50', async () => {
      const rows = [{ updateId: 9, status: 'queued' }];
      const select = mockSelectWhereOrderByLimitOnce(rows);

      const response = await updatesGet(makeRequest('/api/telegram/updates?limit=999', 'GET'));

      expect(select.limit).toHaveBeenCalledWith(50);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ updates: rows });
    });

    it('clamps requested limit to minimum 1', async () => {
      const rows: unknown[] = [];
      const select = mockSelectWhereOrderByLimitOnce(rows);

      const response = await updatesGet(makeRequest('/api/telegram/updates?limit=0', 'GET'));

      expect(select.limit).toHaveBeenCalledWith(1);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ updates: rows });
    });
  });

  describe('webhook route', () => {
    it('returns 401 when secret header does not match', async () => {
      const response = await webhookPost(
        makeRequest(
          '/api/telegram/webhook',
          'POST',
          { update_id: 1 },
          { 'x-telegram-bot-api-secret-token': 'wrong-secret' }
        )
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ ok: false });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('acknowledges malformed json payloads with ok=true', async () => {
      const response = await webhookPost(
        makeRequest('/api/telegram/webhook', 'POST', '{', {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test-webhook-secret',
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('processes callback query update as ignored without chat actions', async () => {
      const inserted = mockInsertValuesOnce();
      const response = await webhookPost(
        makeRequest(
          '/api/telegram/webhook',
          'POST',
          { update_id: 12, callback_query: { id: 'cb-1', data: 'yes' } },
          { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' }
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(inserted.values).toHaveBeenCalledWith(
        expect.objectContaining({
          updateId: 12,
          status: 'ignored',
        })
      );
      expect(mockedTelegramSendMessage).not.toHaveBeenCalled();
      expect(mockedTelegramSendChatAction).not.toHaveBeenCalled();
    });

    it('processes /start command with valid token and links account', async () => {
      mockInsertValuesOnce();
      mockSelectWhereLimitOnce([{ tenantId: 3, userId: 8, expiresAt: new Date(Date.now() + 60_000) }]);
      mockUpdateSetWhereOnce();
      mockSelectWhereLimitOnce([]);
      const linkInsert = mockInsertValuesOnce();
      const statusUpdate = mockUpdateSetWhereOnce();

      const response = await webhookPost(
        makeRequest(
          '/api/telegram/webhook',
          'POST',
          {
            update_id: 33,
            message: {
              message_id: 98,
              text: '/start abc-token',
              chat: { id: 777, type: 'private' },
              from: { id: 1234, is_bot: false, username: 'tester' },
            },
          },
          { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' }
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(linkInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 3,
          userId: 8,
          telegramUserId: 1234,
          telegramChatId: 777,
        })
      );
      expect(statusUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 3,
          status: 'linked',
          telegramUserId: 1234,
          processedAt: expect.any(Date),
        })
      );
      expect(mockedTelegramSendMessage).toHaveBeenCalledWith(777, 'Connected ✅');
    });

    it('processes linked text messages and queues update for worker', async () => {
      mockInsertValuesOnce();
      mockSelectWhereLimitOnce([{ tenantId: 5, userId: 9 }]);
      const chatInsert = mockInsertValuesReturningOnce([{ id: 444, createdAt: new Date('2025-01-01T00:00:00.000Z') }]);
      const queuedUpdate = mockUpdateSetWhereOnce();

      const response = await webhookPost(
        makeRequest(
          '/api/telegram/webhook',
          'POST',
          {
            update_id: 51,
            message: {
              message_id: 222,
              text: 'hello from telegram',
              chat: { id: 901, type: 'private' },
              from: { id: 456, is_bot: false, username: 'unit' },
            },
          },
          { 'x-telegram-bot-api-secret-token': 'test-webhook-secret' }
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
      expect(mockedAuthorizeInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 5,
          userId: 9,
          telegramUserId: 456,
          kind: 'telegram_message',
          content: 'hello from telegram',
        })
      );
      expect(chatInsert.returning).toHaveBeenCalled();
      expect(mockedGetOrCreateDefaultThreadId).toHaveBeenCalledWith(5);
      expect(mockedBumpThreadUpdatedAt).toHaveBeenCalledWith(101);
      expect(mockedBroadcast).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          id: 444,
          threadId: 101,
          content: 'hello from telegram',
        })
      );
      expect(mockedTelegramSendChatAction).toHaveBeenCalledWith(901, 'typing');
      expect(queuedUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 5,
          telegramUserId: 456,
          status: 'queued',
          error: null,
          nextAttemptAt: expect.any(Date),
        })
      );
    });
  });
});
