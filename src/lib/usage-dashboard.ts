export type DateRangePreset = '7d' | '30d' | '90d';

type BreakdownPoint = {
  name: string;
  value: number;
  costUsd: number;
};

type DailyPoint = {
  day: string;
  requests: number;
  costUsd: number;
  directCostUsd: number;
};

type BudgetSnapshot = {
  hasLimit: boolean;
  limitUsd: number | null;
  remainingUsd: number | null;
};

export type UsageViewModel = {
  dateRangeDays: number;
  totalRequestsMonth: number;
  totalCostMonth: number;
  totalSavedMonth: number;
  savedPercentBadge: number;
  budget: BudgetSnapshot;
  dailySeries: DailyPoint[];
  modelBreakdown: BreakdownPoint[];
  providerBreakdown: BreakdownPoint[];
};

type UsagePayload = {
  range: DateRangePreset;
  now?: Date;
  summary: unknown;
  modelBreakdown: unknown;
  providerBreakdown: unknown;
  savings: unknown;
};

type SummaryRow = {
  day: string;
  requests: number;
  costUsd: number;
  savedUsd: number;
  directCostUsd: number;
};

const RANGE_TO_DAYS: Record<DateRangePreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function readNumber(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function toRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
  }
  if (payload && typeof payload === 'object') {
    const rows = (payload as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'));
    }
  }
  return [];
}

function parseSummaryRows(summary: unknown): SummaryRow[] {
  return toRows(summary)
    .map((row) => {
      const day = readString(row, ['date', 'day', 'bucket', 'period']) ?? '';
      const requests = Math.max(0, Math.round(readNumber(row, ['requests', 'requestCount', 'totalRequests'])));
      const costUsd = Math.max(0, readNumber(row, ['costUsd', 'cost', 'totalCostUsd']));
      const savedUsd = Math.max(0, readNumber(row, ['savedUsd', 'totalSavedUsd', 'saved']));
      const directFromPayload = Math.max(0, readNumber(row, ['directCostUsd', 'baselineCostUsd']));
      const directCostUsd = directFromPayload > 0 ? directFromPayload : costUsd + savedUsd;
      return { day, requests, costUsd, savedUsd, directCostUsd };
    })
    .filter((row) => row.day.length > 0);
}

function parseBreakdownRows(
  payload: unknown,
  labelKeys: string[],
): BreakdownPoint[] {
  return toRows(payload).map((row) => ({
    name: readString(row, labelKeys) ?? 'Unknown',
    value: Math.max(0, Math.round(readNumber(row, ['requests', 'requestCount', 'count', 'totalRequests']))),
    costUsd: Math.max(0, readNumber(row, ['costUsd', 'cost', 'totalCostUsd'])),
  }));
}

function isSameUtcMonth(isoDate: string, now: Date): boolean {
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getUTCFullYear() === now.getUTCFullYear() && dt.getUTCMonth() === now.getUTCMonth();
}

function clampMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildUsageViewModel(payload: UsagePayload): UsageViewModel {
  const now = payload.now ?? new Date();
  const dateRangeDays = RANGE_TO_DAYS[payload.range];
  const summaryRows = parseSummaryRows(payload.summary);

  const totalRequestsMonth = summaryRows
    .filter((row) => isSameUtcMonth(row.day, now))
    .reduce((sum, row) => sum + row.requests, 0);
  const totalCostMonth = clampMoney(
    summaryRows
      .filter((row) => isSameUtcMonth(row.day, now))
      .reduce((sum, row) => sum + row.costUsd, 0),
  );
  const totalSavedFromDaily = clampMoney(
    summaryRows
      .filter((row) => isSameUtcMonth(row.day, now))
      .reduce((sum, row) => sum + row.savedUsd, 0),
  );

  const savingsRecord = (payload.savings && typeof payload.savings === 'object')
    ? payload.savings as Record<string, unknown>
    : {};
  const savingsTotal = Math.max(
    totalSavedFromDaily,
    readNumber(savingsRecord, ['totalSavedUsd', 'savedUsd', 'monthSavedUsd', 'saved']),
  );
  const savingsPercentRaw = readNumber(savingsRecord, ['savingsPercent', 'savedPercent', 'pctSaved']);
  const computedPercent = totalCostMonth > 0 ? (savingsTotal / Math.max(totalCostMonth + savingsTotal, 1e-6)) * 100 : 0;
  const savedPercentBadge = clampMoney(Math.max(0, savingsPercentRaw || computedPercent));

  const budgetLimitUsd = readNumber(savingsRecord, ['budgetLimitUsd', 'monthlyBudgetUsd', 'budgetUsd', 'limitUsd']);
  const hasLimit = budgetLimitUsd > 0;
  const budgetRemainingFromPayload = readNumber(
    savingsRecord,
    ['remainingBudgetUsd', 'budgetRemainingUsd', 'remainingUsd'],
  );
  const remainingUsd = hasLimit
    ? clampMoney(Math.max(0, budgetRemainingFromPayload > 0 ? budgetRemainingFromPayload : budgetLimitUsd - totalCostMonth))
    : null;

  const dailySeries = summaryRows
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      day: row.day,
      requests: row.requests,
      costUsd: clampMoney(row.costUsd),
      directCostUsd: clampMoney(Math.max(row.directCostUsd, row.costUsd)),
    }));

  return {
    dateRangeDays,
    totalRequestsMonth,
    totalCostMonth,
    totalSavedMonth: clampMoney(savingsTotal),
    savedPercentBadge,
    budget: {
      hasLimit,
      limitUsd: hasLimit ? clampMoney(budgetLimitUsd) : null,
      remainingUsd,
    },
    dailySeries,
    modelBreakdown: parseBreakdownRows(payload.modelBreakdown, ['model', 'name', 'id']),
    providerBreakdown: parseBreakdownRows(payload.providerBreakdown, ['provider', 'name', 'id']),
  };
}

