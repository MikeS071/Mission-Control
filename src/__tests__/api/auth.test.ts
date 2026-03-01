import { NextRequest } from 'next/server';
import bcryptjs from 'bcryptjs';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db';
import { handlers } from '@/lib/auth';
import { GET, POST } from '@/app/api/auth/[...nextauth]/route';
import { POST as signupPost } from '@/app/api/signup/route';
import { POST as forgotPasswordPost } from '@/app/api/auth/forgot-password/route';
import { POST as resetPasswordPost } from '@/app/api/auth/reset-password/route';

jest.mock('@/lib/auth', () => ({
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}));

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
  },
}));

jest.mock('resend', () => {
  const mockSend = jest.fn();
  const mockResend = jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  }));

  return {
    Resend: mockResend,
    __mockSend: mockSend,
    __mockResend: mockResend,
  };
});

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
};

type MockResendModule = {
  __mockSend: jest.Mock;
  __mockResend: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedBcryptJs = bcryptjs as unknown as { hash: jest.Mock };
const mockedBcrypt = bcrypt as unknown as { hash: jest.Mock };
const resendMocks = jest.requireMock('resend') as MockResendModule;

function createJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockSelectOnce(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });

  mockedDb.select.mockReturnValueOnce({ from } as unknown);

  return { from, where, limit };
}

function setupSignupTransactionMock(options: {
  selectRowsQueue: unknown[][];
  insertReturningRowsQueue: unknown[][];
}) {
  const selectRowsQueue = [...options.selectRowsQueue];
  const insertReturningRowsQueue = [...options.insertReturningRowsQueue];
  const insertedValues: unknown[] = [];

  const tx = {
    select: jest.fn().mockImplementation(() => {
      const rows = selectRowsQueue.shift() ?? [];
      return {
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(rows),
          }),
        }),
      };
    }),
    insert: jest.fn().mockImplementation(() => {
      const returningRows = insertReturningRowsQueue.shift() ?? [];
      const returning = jest.fn().mockResolvedValue(returningRows);

      return {
        values: jest.fn().mockImplementation((value: unknown) => {
          insertedValues.push(value);
          return {
            returning,
            then: (resolve: (value: unknown) => void) => resolve(undefined),
          };
        }),
      };
    }),
  };

  mockedDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx));

  return { tx, insertedValues };
}

function setupResetPasswordTransactionMock() {
  const updateCalls: unknown[] = [];
  const tx = {
    update: jest.fn().mockImplementation(() => ({
      set: jest.fn().mockImplementation((values: unknown) => {
        updateCalls.push(values);
        return {
          where: jest.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  };

  mockedDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx));

  return { tx, updateCalls };
}

describe('Auth API routes', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedDb.select.mockReset();
    mockedDb.insert.mockReset();
    mockedDb.update.mockReset();
    mockedDb.transaction.mockReset();
    mockedBcryptJs.hash.mockReset();
    mockedBcrypt.hash.mockReset();
    resendMocks.__mockSend.mockReset();
    resendMocks.__mockResend.mockClear();

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.RESEND_API_KEY = 'test_resend_api_key';
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.RESEND_API_KEY;
  });

  it('exports NextAuth GET and POST handlers', () => {
    expect(GET).toBeDefined();
    expect(POST).toBeDefined();
    expect(GET).toBe(handlers.GET);
    expect(POST).toBe(handlers.POST);
  });

  it('creates a signup account for valid payloads', async () => {
    mockedBcryptJs.hash.mockResolvedValueOnce('hashed-password');

    const { insertedValues } = setupSignupTransactionMock({
      selectRowsQueue: [
        [], // no existing user
        [], // slug available immediately
      ],
      insertReturningRowsQueue: [
        [{ id: 11, email: 'alice@example.com' }],
        [{ id: 22 }],
        [],
      ],
    });

    const request = createJsonRequest('http://localhost/api/signup', {
      email: 'Alice@Example.COM',
      password: 'password123',
      workspaceName: 'Alpha Team',
      plan: 'archon',
    });

    const response = await signupPost(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, tenantId: 22, plan: 'archon', billingPlan: 'team' });
    expect(mockedBcryptJs.hash).toHaveBeenCalledWith('password123', 12);
    expect(insertedValues[0]).toEqual(expect.objectContaining({ email: 'alice@example.com', passwordHash: 'hashed-password' }));
    expect(insertedValues[1]).toEqual(expect.objectContaining({ slug: 'alpha-team', name: 'Alpha Team', ownerUserId: 11 }));
    expect(insertedValues[2]).toEqual(expect.objectContaining({ tenantId: 22, userEmail: 'alice@example.com', role: 'owner' }));
  });

  it('rejects invalid signup payloads with 400', async () => {
    const request = createJsonRequest('http://localhost/api/signup', {
      email: 'not-an-email',
      password: 'short',
      workspaceName: 'ab',
      plan: 'invalid-plan',
    });

    const response = await signupPost(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('Invalid email');
    expect(mockedDb.transaction).not.toHaveBeenCalled();
    expect(mockedBcryptJs.hash).not.toHaveBeenCalled();
  });

  it('returns 409 when signup email already exists', async () => {
    setupSignupTransactionMock({
      selectRowsQueue: [[{ id: 5 }]],
      insertReturningRowsQueue: [],
    });

    const request = createJsonRequest('http://localhost/api/signup', {
      email: 'existing@example.com',
      password: 'password123',
      workspaceName: 'Workspace Name',
      plan: 'initiate',
    });

    const response = await signupPost(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: 'An account already exists for that email.' });
    expect(mockedBcryptJs.hash).not.toHaveBeenCalled();
  });

  it('appends numeric suffix when signup workspace slug already exists', async () => {
    mockedBcryptJs.hash.mockResolvedValueOnce('hashed-password');

    const { insertedValues } = setupSignupTransactionMock({
      selectRowsQueue: [
        [],
        [{ id: 777 }],
        [],
      ],
      insertReturningRowsQueue: [
        [{ id: 91, email: 'owner@example.com' }],
        [{ id: 73 }],
        [],
      ],
    });

    const request = createJsonRequest('http://localhost/api/signup', {
      email: 'owner@example.com',
      password: 'password123',
      workspaceName: 'My Workspace',
      plan: 'strategos',
    });

    const response = await signupPost(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, tenantId: 73, plan: 'strategos', billingPlan: 'pro' });
    expect(insertedValues[1]).toEqual(expect.objectContaining({ slug: 'my-workspace-2' }));
  });

  it('returns 500 when signup transaction fails unexpectedly', async () => {
    mockedDb.transaction.mockRejectedValueOnce(new Error('db down'));

    const request = createJsonRequest('http://localhost/api/signup', {
      email: 'new@example.com',
      password: 'password123',
      workspaceName: 'Workspace Name',
      plan: 'initiate',
    });

    const response = await signupPost(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'Failed to create your workspace. Please try again.' });
  });

  it('rejects forgot-password requests with invalid emails', async () => {
    const request = createJsonRequest('http://localhost/api/auth/forgot-password', { email: 'invalid' });

    const response = await forgotPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: 'Invalid email address' });
    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(resendMocks.__mockSend).not.toHaveBeenCalled();
  });

  it('returns success for forgot-password when user is not found', async () => {
    mockSelectOnce([]);

    const request = createJsonRequest('http://localhost/api/auth/forgot-password', { email: 'missing@example.com' });

    const response = await forgotPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(resendMocks.__mockSend).not.toHaveBeenCalled();
  });

  it('creates a reset token and sends forgot-password email for existing users', async () => {
    mockSelectOnce([{ id: 123, email: 'user@example.com' }]);

    const insertValues = jest.fn().mockResolvedValue(undefined);
    mockedDb.insert.mockReturnValueOnce({ values: insertValues } as unknown);
    resendMocks.__mockSend.mockResolvedValueOnce({ id: 'email_1' });

    const request = createJsonRequest('http://localhost/api/auth/forgot-password', { email: 'user@example.com' });

    const response = await forgotPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(resendMocks.__mockResend).toHaveBeenCalledWith('test_resend_api_key');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 123,
        used: false,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      })
    );
    expect(resendMocks.__mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your ArchonHQ password',
        text: expect.stringContaining('reset-password?token='),
      })
    );
  });

  it('returns 500 when forgot-password email sending fails', async () => {
    mockSelectOnce([{ id: 88, email: 'user@example.com' }]);

    mockedDb.insert.mockReturnValueOnce({ values: jest.fn().mockResolvedValue(undefined) } as unknown);
    resendMocks.__mockSend.mockRejectedValueOnce(new Error('resend unavailable'));

    const request = createJsonRequest('http://localhost/api/auth/forgot-password', { email: 'user@example.com' });

    const response = await forgotPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'An error occurred. Please try again.' });
  });

  it.each([
    [{ token: '', password: 'password123' }, 'Token is required'],
    [{ token: 'abc', password: 'short' }, 'Password must be at least 8 characters'],
  ])('rejects reset-password payload %j with 400', async (body, message) => {
    const request = createJsonRequest('http://localhost/api/auth/reset-password', body);

    const response = await resetPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: message });
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('returns 400 for reset-password when token is invalid or expired', async () => {
    mockSelectOnce([]);

    const request = createJsonRequest('http://localhost/api/auth/reset-password', {
      token: 'invalid-token',
      password: 'new-password-123',
    });

    const response = await resetPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: 'Invalid or expired reset link' });
    expect(mockedBcrypt.hash).not.toHaveBeenCalled();
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });

  it('resets password and marks reset token used for valid token redemption', async () => {
    mockSelectOnce([{ id: 41, userId: 7 }]);
    mockedBcrypt.hash.mockResolvedValueOnce('hashed-new-password');

    const { tx, updateCalls } = setupResetPasswordTransactionMock();

    const request = createJsonRequest('http://localhost/api/auth/reset-password', {
      token: 'valid-reset-token',
      password: 'new-password-123',
    });

    const response = await resetPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(mockedBcrypt.hash).toHaveBeenCalledWith('new-password-123', 12);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(updateCalls).toEqual([{ passwordHash: 'hashed-new-password' }, { used: true }]);
  });

  it('returns 500 when reset-password hashing fails', async () => {
    mockSelectOnce([{ id: 41, userId: 7 }]);
    mockedBcrypt.hash.mockRejectedValueOnce(new Error('hash failure'));

    const request = createJsonRequest('http://localhost/api/auth/reset-password', {
      token: 'valid-reset-token',
      password: 'new-password-123',
    });

    const response = await resetPasswordPost(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: 'An error occurred. Please try again.' });
    expect(mockedDb.transaction).not.toHaveBeenCalled();
  });
});
