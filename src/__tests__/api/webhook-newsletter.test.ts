import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    delete: jest.fn(),
  },
}));

import { db } from '@/lib/db';
import { GET as unsubscribeGet } from '@/app/api/newsletter/unsubscribe/route';

type MockDb = {
  delete: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedFetch = jest.fn();

function makeRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  return new NextRequest(url, {
    method: opts.method ?? 'GET',
    headers: opts.headers,
    body: opts.body,
  });
}

function signPayload(secret: string, payload: string) {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

async function importWebhookPost() {
  const mod = await import('@/app/api/webhook/github/route');
  return mod.POST;
}

describe('webhook + newsletter routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = mockedFetch as unknown as typeof fetch;
    process.env.NEXTAUTH_URL = 'https://archonhq.ai';
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_PAT;
    delete process.env.NEXTAUTH_URL;
  });

  describe('POST /api/webhook/github', () => {
    it('accepts valid signature and triggers workflow dispatch', async () => {
      process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
      process.env.GITHUB_PAT = 'test-gh-pat';
      jest.resetModules();
      const webhookPost = await importWebhookPost();

      const payload = JSON.stringify({ ref: 'refs/heads/main' });
      const signature = signPayload(process.env.GITHUB_WEBHOOK_SECRET, payload);

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const res = await webhookPost(
        makeRequest('http://localhost/api/webhook/github', {
          method: 'POST',
          headers: {
            'x-hub-signature-256': signature,
            'x-github-event': 'push',
          },
          body: payload,
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        triggered: true,
        workflow: 'deploy.yml',
        ref: 'main',
      });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch.mock.calls[0][0]).toBe(
        'https://api.github.com/repos/MikeS071/Mission-Control/actions/workflows/deploy.yml/dispatches',
      );
      expect(mockedFetch.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-gh-pat',
        }),
      });
    });

    it.each([
      { name: 'missing signature', signature: undefined },
      { name: 'invalid signature', signature: 'sha256=invalid' },
    ])('returns 401 for $name', async ({ signature }) => {
      process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
      process.env.GITHUB_PAT = 'test-gh-pat';
      jest.resetModules();
      const webhookPost = await importWebhookPost();

      const payload = JSON.stringify({ ref: 'refs/heads/main' });
      const headers: Record<string, string> = {
        'x-github-event': 'push',
      };
      if (signature) headers['x-hub-signature-256'] = signature;

      const res = await webhookPost(
        makeRequest('http://localhost/api/webhook/github', {
          method: 'POST',
          headers,
          body: payload,
        }),
      );

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
      expect(mockedFetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/newsletter/unsubscribe', () => {
    it('redirects with ok status for a valid token', async () => {
      process.env.NEXTAUTH_URL = 'https://example.com/';
      const email = 'reader@example.com';
      const token = Buffer.from(email, 'utf-8').toString('base64url');

      const returning = jest.fn().mockResolvedValue([{ email }]);
      const where = jest.fn().mockReturnValue({ returning });
      mockedDb.delete.mockReturnValueOnce({ where });

      const res = await unsubscribeGet(
        makeRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`, {
          method: 'GET',
        }),
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'https://example.com/unsubscribe?status=ok&email=reader%40example.com',
      );
      expect(mockedDb.delete).toHaveBeenCalledTimes(1);
      expect(where).toHaveBeenCalledTimes(1);
      expect(returning).toHaveBeenCalledWith(expect.any(Object));
    });

    it('returns 400 for an invalid unsubscribe token', async () => {
      const token = Buffer.from('not-an-email', 'utf-8').toString('base64url');

      const res = await unsubscribeGet(
        makeRequest(`http://localhost/api/newsletter/unsubscribe?token=${token}`, {
          method: 'GET',
        }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'Invalid token' });
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });
  });
});
