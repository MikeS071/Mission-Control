const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_STALE_THRESHOLDS = {
  agingDays: 3,
  staleDays: 7,
} as const;

function parseThreshold(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function getAgeInDays(updatedAt: Date): number {
  const timestamp = updatedAt.getTime();
  if (!Number.isFinite(timestamp)) return 0;

  const elapsedMs = Date.now() - timestamp;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;

  return elapsedMs / DAY_IN_MS;
}

export function getStaleThresholds() {
  const agingDays = parseThreshold(process.env.KANBAN_STALE_AGING_DAYS, DEFAULT_STALE_THRESHOLDS.agingDays);
  const staleDaysRaw = parseThreshold(process.env.KANBAN_STALE_DAYS, DEFAULT_STALE_THRESHOLDS.staleDays);
  const staleDays = Math.max(staleDaysRaw, agingDays);
  return { agingDays, staleDays };
}

export function getDaysSinceUpdate(task: { updatedAt: Date }): number {
  return Math.floor(getAgeInDays(task.updatedAt));
}

export function isStale(task: { updatedAt: Date }, thresholdDays: number): boolean {
  if (!Number.isFinite(thresholdDays) || thresholdDays < 0) return false;
  return getAgeInDays(task.updatedAt) > thresholdDays;
}

export function getStaleLevel(task: { updatedAt: Date }): 'fresh' | 'aging' | 'stale' {
  const ageDays = getAgeInDays(task.updatedAt);
  const { agingDays, staleDays } = getStaleThresholds();

  if (ageDays < agingDays) return 'fresh';
  if (ageDays <= staleDays) return 'aging';
  return 'stale';
}
