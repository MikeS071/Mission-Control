process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';

jest.mock('next-auth', () => {
  const nextAuth = jest.fn(() => ({
    auth: jest.fn(),
    handlers: { GET: jest.fn(), POST: jest.fn() },
  }));
  return { __esModule: true, default: nextAuth };
});

jest.mock('next-auth/providers/credentials', () => {
  const credentials = jest.fn((config: Record<string, unknown>) => ({
    id: 'credentials',
    ...config,
  }));
  return { __esModule: true, default: credentials };
});

jest.mock('next-auth/providers/google', () => {
  const google = jest.fn((config: Record<string, unknown>) => ({
    id: 'google',
    ...config,
  }));
  return { __esModule: true, default: google };
});

jest.mock('bcryptjs', () => {
  const compare = jest.fn();
  return {
    __esModule: true,
    default: { compare },
    compare,
  };
});

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((left: unknown, right: unknown) => ({ left, right })),
}));

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';
import '@/lib/auth';

const mockedNextAuth = NextAuth as unknown as jest.Mock;
const mockedCredentials = Credentials as unknown as jest.Mock;
const mockedGoogle = Google as unknown as jest.Mock;
const mockedBcrypt = bcrypt as unknown as { compare: jest.Mock };
const mockedEq = eq as unknown as jest.Mock;
const mockedDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

type RuntimeAuthConfig = {
  providers: Array<Record<string, unknown>>;
  callbacks: {
    jwt: (params: { token: Record<string, unknown>; user?: { email?: string; name?: string } | null }) => Promise<Record<string, unknown>>;
    session: (params: { session: Record<string, unknown>; token: Record<string, unknown> }) => Record<string, unknown>;
  };
};

function getRuntimeConfig(): RuntimeAuthConfig {
  const call = mockedNextAuth.mock.calls[0]?.[0];
  if (!call) throw new Error('NextAuth config was not initialized');
  return call as RuntimeAuthConfig;
}

function getCredentialsProvider() {
  const provider = getRuntimeConfig().providers.find((entry) => typeof entry.authorize === 'function');
  if (!provider) throw new Error('Credentials provider is missing');
  return provider as { authorize: (credentials?: { email?: string; password?: string }) => Promise<unknown> };
}

function queueSelectLimit(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  mockedDb.select.mockReturnValueOnce({ from });
  return { from, where, limit };
}

function queueInsertReturning(rows: unknown[]) {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn().mockReturnValue({ returning });
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values, returning };
}

function queueInsertValues() {
  const values = jest.fn().mockResolvedValue(undefined);
  mockedDb.insert.mockReturnValueOnce({ values });
  return { values };
}

function queueUpdateSet() {
  const where = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where });
  mockedDb.update.mockReturnValueOnce({ set });
  return { set, where };
}

describe('auth config', () => {
  beforeEach(() => {
    mockedDb.select.mockReset();
    mockedDb.insert.mockReset();
    mockedDb.update.mockReset();
    mockedEq.mockClear();
    mockedBcrypt.compare.mockReset();
    jest.restoreAllMocks();
  });

  it('configures Google provider with account linking enabled', () => {
    expect(mockedGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'test-google-client-id',
        clientSecret: 'test-google-client-secret',
        allowDangerousEmailAccountLinking: true,
      })
    );
    expect(authConfig.providers).toHaveLength(1);
  });

  it('session callback hydrates tenant and user fields from token', () => {
    const sessionCallback = authConfig.callbacks?.session as unknown as (params: {
      session: Record<string, unknown>;
      token: Record<string, unknown>;
    }) => Record<string, unknown>;
    const session = { user: { name: 'Pat', email: 'pat@example.com' } };
    const token = { tenantId: 42, sub: 'user-42', isAdmin: true };

    const result = sessionCallback({ session, token });

    expect(result).toBe(session);
    expect(session).toMatchObject({
      tenantId: 42,
      user: {
        id: 'user-42',
        isAdmin: true,
      },
    });
  });

  it('redirect callback allows relative and same-origin URLs, blocks unsafe URLs', () => {
    const redirect = authConfig.callbacks?.redirect as (params: { url: string; baseUrl: string }) => string;
    const baseUrl = 'https://app.openclaw.test';

    expect(redirect({ url: '/signin', baseUrl })).toBe('https://app.openclaw.test/signin');
    expect(redirect({ url: 'https://app.openclaw.test/profile', baseUrl })).toBe('https://app.openclaw.test/profile');
    expect(redirect({ url: 'https://evil.example.com/phish', baseUrl })).toBe('https://app.openclaw.test/dashboard');
  });
});

describe('auth runtime callbacks and credential flow', () => {
  beforeEach(() => {
    mockedDb.select.mockReset();
    mockedDb.insert.mockReset();
    mockedDb.update.mockReset();
    mockedEq.mockClear();
    mockedBcrypt.compare.mockReset();
    jest.restoreAllMocks();
  });

  it('registers both OAuth and credentials providers in NextAuth runtime config', () => {
    const config = getRuntimeConfig();

    expect(mockedCredentials).toHaveBeenCalledTimes(1);
    expect(config.providers).toHaveLength(2);
  });

  it('authorizes valid credentials and normalizes email lookups', async () => {
    queueSelectLimit([{ id: 5, email: 'Alice@Example.com', name: 'Alice', passwordHash: 'hashed-password' }]);
    mockedBcrypt.compare.mockResolvedValue(true);
    const provider = getCredentialsProvider();

    const result = await provider.authorize({
      email: '  ALICE@Example.com ',
      password: 'plaintext-password',
    });

    expect(result).toEqual({
      id: '5',
      email: 'Alice@Example.com',
      name: 'Alice',
    });
    expect(mockedBcrypt.compare).toHaveBeenCalledWith('plaintext-password', 'hashed-password');
    expect(mockedEq.mock.calls[0]?.[1]).toBe('alice@example.com');
  });

  it('rejects login when password is wrong', async () => {
    queueSelectLimit([{ id: 1, email: 'badpass@example.com', passwordHash: 'stored-hash' }]);
    mockedBcrypt.compare.mockResolvedValue(false);
    const provider = getCredentialsProvider();

    await expect(provider.authorize({ email: 'badpass@example.com', password: 'wrong' })).resolves.toBeNull();
  });

  it('rejects login when credentials are incomplete', async () => {
    const provider = getCredentialsProvider();

    await expect(provider.authorize({ email: 'missing-password@example.com' })).resolves.toBeNull();

    expect(mockedDb.select).not.toHaveBeenCalled();
    expect(mockedBcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects suspended users even if password matches', async () => {
    queueSelectLimit([{ id: 6, email: 'blocked@example.com', passwordHash: 'stored-hash', isSuspended: true }]);
    mockedBcrypt.compare.mockResolvedValue(true);
    const provider = getCredentialsProvider();

    await expect(provider.authorize({ email: 'blocked@example.com', password: 'correct' })).resolves.toBeNull();
  });

  it('jwt callback returns token unchanged when user email is missing', async () => {
    const jwt = getRuntimeConfig().callbacks.jwt;
    const token = { existing: 'token-data' };

    const result = await jwt({ token, user: null });

    expect(result).toBe(token);
    expect(mockedDb.select).not.toHaveBeenCalled();
  });

  it('jwt callback enriches token with tenantId and non-admin role', async () => {
    const jwt = getRuntimeConfig().callbacks.jwt;
    queueSelectLimit([{ id: 9, email: 'member@example.com', name: 'Member' }]);
    queueSelectLimit([{ tenantId: 77, role: 'member' }]);

    const result = await jwt({
      token: {},
      user: { email: 'member@example.com', name: 'Member' },
    });

    expect(result).toMatchObject({ tenantId: 77, isAdmin: false, userId: '9' });
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('jwt callback enriches token with admin role when membership is owner', async () => {
    const jwt = getRuntimeConfig().callbacks.jwt;
    queueSelectLimit([{ id: 10, email: 'owner@example.com', name: 'Owner' }]);
    queueSelectLimit([{ tenantId: 1, role: 'owner' }]);

    const result = await jwt({
      token: {},
      user: { email: 'owner@example.com', name: 'Owner' },
    });

    expect(result).toMatchObject({ tenantId: 1, isAdmin: true, userId: '10' });
  });

  it('jwt callback upserts OAuth user, creates tenant/membership for new users', async () => {
    const jwt = getRuntimeConfig().callbacks.jwt;
    queueSelectLimit([]);
    const createUser = queueInsertReturning([{ id: 111, email: 'new.oauth@example.com', name: 'New OAuth' }]);
    queueSelectLimit([]);
    const createTenant = queueInsertReturning([{ id: 503 }]);
    const createMembership = queueInsertValues();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const result = await jwt({
      token: {},
      user: { email: 'new.oauth@example.com', name: 'New OAuth' },
    });

    expect(createUser.values).toHaveBeenCalledWith({ email: 'new.oauth@example.com', name: 'New OAuth' });
    expect(createTenant.values).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 111,
        plan: 'free',
      })
    );
    expect(createMembership.values).toHaveBeenCalledWith({
      tenantId: 503,
      userEmail: 'new.oauth@example.com',
      role: 'owner',
    });
    expect(result).toMatchObject({ tenantId: 503, isAdmin: true, userId: '111' });
  });

  it('jwt callback updates changed display name for existing users', async () => {
    const jwt = getRuntimeConfig().callbacks.jwt;
    queueSelectLimit([{ id: 14, email: 'rename@example.com', name: 'Old Name' }]);
    const updateUser = queueUpdateSet();
    queueSelectLimit([{ tenantId: 14, role: 'admin' }]);

    const result = await jwt({
      token: {},
      user: { email: 'rename@example.com', name: 'New Name' },
    });

    expect(updateUser.set).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', updatedAt: expect.any(Date) }));
    expect(result).toMatchObject({ tenantId: 14, isAdmin: true, userId: '14' });
  });
});
