import { count, desc, eq } from 'drizzle-orm';

import { policyAuditLogs, tenants } from '@/db/schema';
import { db } from '@/lib/db';

export type AuditLogQuery = {
  tenantId?: number;
  page?: number;
  limit?: number;
};

export type AuditLogItem = {
  id: number;
  tenantId: number;
  tenantName: string;
  changedBy: string;
  oldRules: Record<string, unknown>;
  newRules: Record<string, unknown>;
  diffSummary: string;
  reason: string;
  timestamp: string;
};

export type AuditLogResult = {
  items: AuditLogItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPlainObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function flattenRulePaths(
  value: unknown,
  prefix = '',
  output: Map<string, string> = new Map(),
): Map<string, string> {
  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));

    for (const [key, nested] of entries) {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key;
      flattenRulePaths(nested, nestedPrefix, output);
    }

    return output;
  }

  const path = prefix || '$';
  output.set(path, JSON.stringify(value));
  return output;
}

function summarizeRulesDiff(oldRules: Record<string, unknown>, newRules: Record<string, unknown>): string {
  const oldPaths = flattenRulePaths(oldRules);
  const newPaths = flattenRulePaths(newRules);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [path, oldValue] of oldPaths.entries()) {
    if (!newPaths.has(path)) {
      removed.push(path);
      continue;
    }

    if (newPaths.get(path) !== oldValue) {
      changed.push(path);
    }
  }

  for (const path of newPaths.keys()) {
    if (!oldPaths.has(path)) {
      added.push(path);
    }
  }

  const totalChanges = added.length + removed.length + changed.length;
  if (totalChanges === 0) {
    return 'No changes';
  }

  const previewPaths = [...changed, ...added, ...removed].slice(0, 3);
  const extraCount = totalChanges - previewPaths.length;
  const preview = previewPaths.length > 0
    ? ` (${previewPaths.join(', ')}${extraCount > 0 ? ` +${extraCount} more` : ''})`
    : '';

  return `${changed.length} changed, ${added.length} added, ${removed.length} removed${preview}`;
}

function toIsoString(value: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.min(Math.trunc(value), max);
}

export async function listPolicyAuditLogs(query: AuditLogQuery): Promise<AuditLogResult> {
  const tenantId = query.tenantId;
  const page = clampPositiveInt(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampPositiveInt(query.limit, 20, 100);
  const offset = (page - 1) * limit;

  const [totalRow] = tenantId
    ? await db
      .select({ total: count() })
      .from(policyAuditLogs)
      .where(eq(policyAuditLogs.tenantId, tenantId))
    : await db
      .select({ total: count() })
      .from(policyAuditLogs);

  const rows = tenantId
    ? await db
      .select({
        id: policyAuditLogs.id,
        tenantId: policyAuditLogs.tenantId,
        tenantName: tenants.name,
        changedBy: policyAuditLogs.changedBy,
        oldRules: policyAuditLogs.oldRules,
        newRules: policyAuditLogs.newRules,
        reason: policyAuditLogs.reason,
        createdAt: policyAuditLogs.createdAt,
      })
      .from(policyAuditLogs)
      .innerJoin(tenants, eq(tenants.id, policyAuditLogs.tenantId))
      .where(eq(policyAuditLogs.tenantId, tenantId))
      .orderBy(desc(policyAuditLogs.createdAt), desc(policyAuditLogs.id))
      .limit(limit)
      .offset(offset)
    : await db
      .select({
        id: policyAuditLogs.id,
        tenantId: policyAuditLogs.tenantId,
        tenantName: tenants.name,
        changedBy: policyAuditLogs.changedBy,
        oldRules: policyAuditLogs.oldRules,
        newRules: policyAuditLogs.newRules,
        reason: policyAuditLogs.reason,
        createdAt: policyAuditLogs.createdAt,
      })
      .from(policyAuditLogs)
      .innerJoin(tenants, eq(tenants.id, policyAuditLogs.tenantId))
      .orderBy(desc(policyAuditLogs.createdAt), desc(policyAuditLogs.id))
      .limit(limit)
      .offset(offset);

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const items = rows.map((row) => {
    const oldRules = toPlainObject(row.oldRules);
    const newRules = toPlainObject(row.newRules);

    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      changedBy: row.changedBy,
      oldRules,
      newRules,
      diffSummary: summarizeRulesDiff(oldRules, newRules),
      reason: row.reason,
      timestamp: toIsoString(row.createdAt),
    };
  });

  return {
    items,
    page,
    limit,
    total,
    totalPages,
  };
}
