import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import { GET as waitlistGet, POST as waitlistPost } from '@/app/api/waitlist/route';
import { GET as waitlistEmailsGet } from '@/app/api/waitlist/emails/route';

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedFetch = jest.fn();

function makeRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const headers = new Headers(opts.headers ?? {});
  const hasBody = opts.body !== undefined;

  if (hasBody && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    method: opts.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

function createSelectFromBuilder(rows: unknown[]) {
  const from = jest.fn().mockResolvedValue(rows);
  return { from };
}

function createSelectOrderByLimitBuilder(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy, limit };
}

function createSelectOrderByBuilder(rows: unknown[]) {
  const orderBy = jest.fn().mockResolvedValue(rows);
  const from = jest.fn().mockReturnValue({ orderBy });
  return { from, orderBy };
}

function createInsertValuesBuilder(result?: unknown, error?: unknown) {
  const values = error
    ? jest.fn().mockRejectedValue(error)
    : jest.fn().mockResolvedValue(result);
  return { values };
}

describe('waitlist API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_SECRET = 'test-api-secret';
    process.env.RESEND_API_KEY = 'test-resend-key';
    (global as unknown as { fetch: typeof fetch }).fetch = mockedFetch as unknown as typeof fetch;
    mockedFetch.mockResolvedValue({ ok: true } as Response);
  });

  describe('waitlist route', () => {
    it('GET returns count', async () => {
      const selectBuilder = createSelectFromBuilder([{ count: 12 }]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await waitlistGet();

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ count: 12 });
      expect(selectBuilder.from).toHaveBeenCalled();
    });

    it('POST returns 400 for invalid email', async () => {
      const res = await waitlistPost(
        makeRequest('http://localhost/api/waitlist', {
          body: { email: 'not-an-email' },
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid email' });
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it('POST inserts row and returns position for landing source', async () => {
      const insertBuilder = createInsertValuesBuilder();
      const countBuilder = createSelectFromBuilder([{ count: 3 }]);
      const issueBuilder = createSelectOrderByLimitBuilder([]);

      mockedDb.insert.mockReturnValueOnce(insertBuilder);
      mockedDb.select
        .mockReturnValueOnce({ from: countBuilder.from })
        .mockReturnValueOnce({ from: issueBuilder.from });

      const res = await waitlistPost(
        makeRequest('http://localhost/api/waitlist', {
          body: { email: '  User@Example.com  ', source: 'landing' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, position: 3 });
      expect(insertBuilder.values).toHaveBeenCalledWith({
        email: 'user@example.com',
        source: 'landing',
      });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');
      expect(mockedFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    });

    it('POST uses blog subject and sends latest newsletter when available', async () => {
      const insertBuilder = createInsertValuesBuilder();
      const countBuilder = createSelectFromBuilder([{ count: 8 }]);
      const issueBuilder = createSelectOrderByLimitBuilder([
        {
          subject: 'Latest from ArchonHQ',
          html: '<a href="/u?token=UNSUB_TOKEN_PLACEHOLDER">Unsubscribe</a>',
        },
      ]);

      mockedDb.insert.mockReturnValueOnce(insertBuilder);
      mockedDb.select
        .mockReturnValueOnce({ from: countBuilder.from })
        .mockReturnValueOnce({ from: issueBuilder.from });

      const res = await waitlistPost(
        makeRequest('http://localhost/api/waitlist', {
          body: { email: 'reader@example.com', source: 'blog' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, position: 8 });

      await Promise.resolve();
      await Promise.resolve();

      expect(mockedFetch).toHaveBeenCalledTimes(2);

      const firstBody = JSON.parse(mockedFetch.mock.calls[0][1].body as string) as {
        subject: string;
      };
      const secondBody = JSON.parse(mockedFetch.mock.calls[1][1].body as string) as {
        subject: string;
        html: string;
      };

      expect(firstBody.subject).toContain("You're subscribed!");
      expect(secondBody.subject).toBe('Latest from ArchonHQ');
      expect(secondBody.html).toContain('cmVhZGVyQGV4YW1wbGUuY29t');
    });

    it('POST returns 409 when email already exists', async () => {
      const insertBuilder = createInsertValuesBuilder(undefined, { code: '23505' });
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await waitlistPost(
        makeRequest('http://localhost/api/waitlist', {
          body: { email: 'dupe@example.com' },
        }),
      );

      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toEqual({ ok: true, alreadyJoined: true });
    });

    it('POST returns 500 for non-unique database error', async () => {
      const insertBuilder = createInsertValuesBuilder(undefined, new Error('db down'));
      mockedDb.insert.mockReturnValueOnce(insertBuilder);

      const res = await waitlistPost(
        makeRequest('http://localhost/api/waitlist', {
          body: { email: 'fail@example.com' },
        }),
      );

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'Internal server error' });
    });
  });

  describe('waitlist emails route', () => {
    it('GET returns 401 when API secret is not configured', async () => {
      delete process.env.API_SECRET;

      const res = await waitlistEmailsGet(makeRequest('http://localhost/api/waitlist/emails'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns 401 when bearer token is invalid', async () => {
      const res = await waitlistEmailsGet(
        makeRequest('http://localhost/api/waitlist/emails', {
          headers: { authorization: 'Bearer wrong-token' },
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'Unauthorized' });
      expect(mockedDb.select).not.toHaveBeenCalled();
    });

    it('GET returns waitlist emails when authorized', async () => {
      const selectBuilder = createSelectOrderByBuilder([
        { email: 'first@example.com' },
        { email: 'second@example.com' },
      ]);
      mockedDb.select.mockReturnValueOnce({ from: selectBuilder.from });

      const res = await waitlistEmailsGet(
        makeRequest('http://localhost/api/waitlist/emails', {
          headers: { authorization: 'Bearer test-api-secret' },
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        emails: ['first@example.com', 'second@example.com'],
        count: 2,
      });
      expect(selectBuilder.orderBy).toHaveBeenCalled();
    });
  });
});
