import { NextRequest } from 'next/server';

export type UsagePeriod = 'daily' | 'monthly';
export type UsageGroupBy = 'model' | 'provider';

const DAY_MS = 24 * 60 * 60 * 1000;

export function parsePeriod(raw: string | null): UsagePeriod | null {
  if (raw === null) return 'daily';
  if (raw === 'daily' || raw === 'monthly') return raw;
  return null;
}

export function parseGroupBy(raw: string | null): UsageGroupBy | null {
  if (raw === null) return 'model';
  if (raw === 'model' || raw === 'provider') return raw;
  return null;
}

export function parseIsoDate(raw: string | null): Date | null {
  if (raw === null) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function resolveDateRange(req: NextRequest): {
  from: Date;
  to: Date;
  error: string | null;
} {
  const { searchParams } = new URL(req.url);
  const now = new Date();

  const parsedFrom = parseIsoDate(searchParams.get('from'));
  const parsedTo = parseIsoDate(searchParams.get('to'));

  if (searchParams.get('from') !== null && parsedFrom === null) {
    return { from: now, to: now, error: 'from must be a valid ISO date' };
  }
  if (searchParams.get('to') !== null && parsedTo === null) {
    return { from: now, to: now, error: 'to must be a valid ISO date' };
  }

  const to = parsedTo ?? now;
  const from = parsedFrom ?? new Date(to.getTime() - (29 * DAY_MS));

  if (from > to) {
    return { from, to, error: 'from must be before or equal to to' };
  }

  return { from, to, error: null };
}
