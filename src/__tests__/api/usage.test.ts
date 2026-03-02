import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  db: {
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/tenant', () => ({
  resolveTenantId: jest.fn(),
}));

import { db } from '@/lib/db';
import { resolveTenantId } from '@/lib/tenant';
import { GET as getUsageSummary } from '@/app/api/usage/summary/route';
import { GET as getUsageBreakdown } from '@/app/api/usage/breakdown/route';
import { GET as getUsageSavings } from '@/app/api/usage/savings/route';

type MockDb = {
  execute: jest.Mock;
};

const mockedDb = db as unknown as MockDb;
const mockedResolveTenantId = resolveTenantId as jest.MockedFunction<typeof resolveTenantId>;

function makeRequest(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

function extractSqlPieces(sqlArg: {
  queryChunks?: unknown[];
}) {
  const chunks = sqlArg.queryChunks ?? [];
  const text = chunks
    .map((chunk) => (chunk && typeof chunk === 'object' && 'value' in chunk ? String((chunk as { value: unknown[] }).value[0]) : ''))
    .join('');
  const params = chunks.filter((chunk) => !(chunk && typeof chunk === 'object' && 'value' in chunk));
  return { text, params };
}

describe('usage API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockedResolveTenantId.mockResolvedValue(7);
    mockedDb.execute.mockResolvedValue({ rows: [] });
  });

  describe('GET /api/usage/summary', () => {
    it('returns usage summary rows for the authenticated tenant', async () => {
      mockedDb.execute.mockResolvedValueOnce({
        rows: [
          {
            period: 'monthly',
            bucket_start: '2026-02-01T00:00:00.000Z',
            total_tokens: '1200',
            total_cost_usd: '12.5000',
            total_saved_usd: '5.0000',
            total_requests: '10',
          },
        ],
      });

      const res = await getUsageSummary(
        makeRequest('http://localhost/api/usage/summary?period=monthly&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z'),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        rows: [
          {
            period: 'monthly',
            bucket_start: '2026-02-01T00:00:00.000Z',
            total_tokens: '1200',
            total_cost_usd: '12.5000',
            total_saved_usd: '5.0000',
            total_requests: '10',
          },
        ],
      });

      const sqlArg = mockedDb.execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
      const sql = extractSqlPieces(sqlArg);
      expect(sql.text).toContain('FROM usage_summary');
      expect(sql.params).toEqual(expect.arrayContaining([7, 'monthly']));
    });

    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await getUsageSummary(makeRequest('http://localhost/api/usage/summary'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid period', async () => {
      const res = await getUsageSummary(makeRequest('http://localhost/api/usage/summary?period=yearly'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'period must be daily or monthly' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });

    it('defaults to daily period and a bounded date window when query params are omitted', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-02T00:00:00.000Z'));

      const res = await getUsageSummary(makeRequest('http://localhost/api/usage/summary'));

      expect(res.status).toBe(200);
      const sqlArg = mockedDb.execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
      const sql = extractSqlPieces(sqlArg);
      expect(sql.text).toContain('FROM usage_summary');
      expect(sql.params).toEqual(
        expect.arrayContaining([
          7,
          'daily',
          new Date('2026-02-01T00:00:00.000Z'),
          new Date('2026-03-02T00:00:00.000Z'),
        ]),
      );
    });
  });

  describe('GET /api/usage/breakdown', () => {
    it('aggregates usage by provider for the authenticated tenant', async () => {
      mockedDb.execute.mockResolvedValueOnce({
        rows: [
          { group_key: 'openai', total_tokens: '900', total_cost_usd: '9.0000', total_requests: '6' },
          { group_key: 'anthropic', total_tokens: '300', total_cost_usd: '3.0000', total_requests: '4' },
        ],
      });

      const res = await getUsageBreakdown(
        makeRequest('http://localhost/api/usage/breakdown?groupBy=provider&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z'),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        rows: [
          { group_key: 'openai', total_tokens: '900', total_cost_usd: '9.0000', total_requests: '6' },
          { group_key: 'anthropic', total_tokens: '300', total_cost_usd: '3.0000', total_requests: '4' },
        ],
      });

      const sqlArg = mockedDb.execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
      const sql = extractSqlPieces(sqlArg);
      expect(sql.text).toContain('FROM usage_ledger');
      expect(sql.params).toEqual(expect.arrayContaining([7]));
    });

    it('returns 400 for invalid groupBy value', async () => {
      const res = await getUsageBreakdown(makeRequest('http://localhost/api/usage/breakdown?groupBy=region'));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'groupBy must be model or provider' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid date range', async () => {
      const res = await getUsageBreakdown(
        makeRequest('http://localhost/api/usage/breakdown?groupBy=model&from=2026-03-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z'),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: 'from must be before or equal to to' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/usage/savings', () => {
    it('returns total saved, hypothetical spend, and percentage', async () => {
      mockedDb.execute.mockResolvedValueOnce({
        rows: [{ total_saved_usd: '20.5000', hypothetical_total_usd: '100.5000' }],
      });

      const res = await getUsageSavings(makeRequest('http://localhost/api/usage/savings'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        totalSavedUsd: '20.5000',
        hypotheticalTotalUsd: '100.5000',
        savingsPct: '20.40',
      });

      const sqlArg = mockedDb.execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
      const sql = extractSqlPieces(sqlArg);
      expect(sql.text).toContain('FROM usage_summary');
      expect(sql.params).toEqual(expect.arrayContaining([7]));
    });

    it('returns 401 when tenant is missing', async () => {
      mockedResolveTenantId.mockResolvedValueOnce(null);

      const res = await getUsageSavings(makeRequest('http://localhost/api/usage/savings'));

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
      expect(mockedDb.execute).not.toHaveBeenCalled();
    });

    it('returns 0% when hypothetical spend is zero', async () => {
      mockedDb.execute.mockResolvedValueOnce({
        rows: [{ total_saved_usd: '0.0000', hypothetical_total_usd: '0.0000' }],
      });

      const res = await getUsageSavings(makeRequest('http://localhost/api/usage/savings'));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        totalSavedUsd: '0.0000',
        hypotheticalTotalUsd: '0.0000',
        savingsPct: '0.00',
      });
    });
  });
});
