/**
 * activity.ts — Activity feed core
 *
 * Exports:
 *   ActivityEventType   — union of all v1 event type strings
 *   emitEvent()         — fire-and-forget insert into activity_queue
 *   drainQueue()        — process queue → activity_events (with grouping)
 *   registerFeedClient()  — SSE client registration
 *   broadcastFeedUpdate() — push to all SSE clients for a tenant
 */

import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { activityQueue, activityEvents } from '@/db/schema';

// ── Event types ───────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'badge_earned'
  | 'xp_rank_up'
  | 'challenge_completed'
  | 'streak_milestone'
  | 'tasks_burst'
  | 'all_tasks_cleared';

// ── Event metadata ────────────────────────────────────────────────────────────

type EventMeta = {
  icon: string;
  displayName: (payload: Record<string, unknown>, count?: number) => string;
  description: (payload: Record<string, unknown>, count?: number) => string;
};

const EVENT_META: Record<ActivityEventType, EventMeta> = {
  badge_earned: {
    icon: '🏅',
    displayName: (p, count) =>
      count && count > 1 ? `${count} badges earned` : `Badge earned`,
    description: (p, count) =>
      count && count > 1
        ? `${count} badges were earned recently`
        : `${String(p.badgeName ?? 'Unknown badge')} unlocked`,
  },
  xp_rank_up: {
    icon: '⬆️',
    displayName: (p, count) =>
      count && count > 1 ? `${count} rank-ups` : `Rank up`,
    description: (p, count) =>
      count && count > 1
        ? `${count} agents ranked up`
        : `${String(p.agentName ?? 'Agent')} reached ${String(p.newRank ?? 'a new rank')}`,
  },
  challenge_completed: {
    icon: '🎯',
    displayName: (p, count) =>
      count && count > 1 ? `${count} challenges completed` : `Challenge completed`,
    description: (p, count) =>
      count && count > 1
        ? `${count} challenges cleared`
        : `${String(p.challengeName ?? 'A challenge')} completed`,
  },
  streak_milestone: {
    icon: '🔥',
    displayName: (p) => `Streak milestone`,
    description: (p) =>
      `${String(p.agentName ?? 'Agent')} hit a ${String(p.days ?? '?')}-day streak`,
  },
  tasks_burst: {
    icon: '⚡',
    displayName: (p, count) =>
      count && count > 1 ? `${count} task bursts` : `Task burst`,
    description: (p, count) =>
      count && count > 1
        ? `${count} task bursts completed`
        : `${String(p.taskCount ?? '?')} tasks done in quick succession`,
  },
  all_tasks_cleared: {
    icon: '✅',
    displayName: (p) => `All tasks cleared`,
    description: (p) =>
      `Every task in ${String(p.columnName ?? 'the board')} was completed`,
  },
};

// ── emitEvent ─────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: writes a raw event to activity_queue.
 * Never throws — safe to call from any route without try/catch.
 */
export async function emitEvent(
  tenantId: number,
  eventType: ActivityEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(activityQueue).values({
      tenantId,
      eventType,
      payloadJson: payload,
    });
  } catch {
    // Intentionally swallowed — activity feed must never break callers
  }
}

// ── drainQueue ────────────────────────────────────────────────────────────────

type QueueRow = typeof activityQueue.$inferSelect;

/**
 * Reads all unprocessed queue rows (optionally scoped to a tenantId).
 * Groups ≥3 same-type events within a 5-minute window into one grouped tile.
 * Writes resulting events to activity_events and marks queue rows processed.
 *
 * Returns the new activity_events rows created.
 */
export async function drainQueue(tenantId?: number): Promise<typeof activityEvents.$inferSelect[]> {
  // 1. Fetch unprocessed rows
  const conditions = tenantId
    ? and(eq(activityQueue.processed, false), eq(activityQueue.tenantId, tenantId))
    : eq(activityQueue.processed, false);

  const rows = await db
    .select()
    .from(activityQueue)
    .where(conditions)
    .orderBy(activityQueue.createdAt);

  if (rows.length === 0) return [];

  // 2. Group into 5-minute buckets per (tenantId, eventType)
  type Bucket = { rows: QueueRow[]; bucketKey: string };
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const bucketTs = Math.floor(row.createdAt.getTime() / (5 * 60 * 1000));
    const key = `${row.tenantId}::${row.eventType}::${bucketTs}`;
    if (!buckets.has(key)) {
      buckets.set(key, { rows: [], bucketKey: key });
    }
    buckets.get(key)!.rows.push(row);
  }

  // 3. Build activity_events rows
  const toInsert: (typeof activityEvents.$inferInsert)[] = [];
  const processedIds: string[] = [];

  for (const { rows: bRows } of buckets.values()) {
    const first = bRows[0]!;
    const meta = EVENT_META[first.eventType as ActivityEventType];
    if (!meta) continue; // unknown type — skip

    const count = bRows.length >= 3 ? bRows.length : undefined;
    const firstPayload = (first.payloadJson ?? {}) as Record<string, unknown>;

    toInsert.push({
      tenantId: first.tenantId,
      eventType: first.eventType,
      displayName: meta.displayName(firstPayload, count),
      description: meta.description(firstPayload, count),
      icon: meta.icon,
      payloadJson: count ? { count, samples: bRows.slice(0, 3).map((r) => r.payloadJson) } : firstPayload,
      createdAt: first.createdAt,
    });

    processedIds.push(...bRows.map((r) => r.id));
  }

  if (toInsert.length === 0) return [];

  // 4. Write events + mark queue rows processed in parallel
  const [inserted] = await Promise.all([
    db.insert(activityEvents).values(toInsert).returning(),
    db
      .update(activityQueue)
      .set({ processed: true })
      .where(
        and(
          eq(activityQueue.processed, false),
          sql`id = ANY(ARRAY[${sql.join(processedIds.map((id) => sql`${id}::uuid`), sql`, `)}])`,
        ),
      ),
  ]);

  return inserted;
}

// ── SSE broadcaster ───────────────────────────────────────────────────────────

type FeedController = ReadableStreamDefaultController<Uint8Array>;

// Module-level singleton: tenantId → set of active SSE controllers
const feedClients = new Map<number, Set<FeedController>>();

/**
 * Register a new SSE client for a tenant.
 * Call this when a client connects to GET /api/activity/stream.
 */
export function registerFeedClient(tenantId: number, controller: FeedController): void {
  if (!feedClients.has(tenantId)) {
    feedClients.set(tenantId, new Set());
  }
  feedClients.get(tenantId)!.add(controller);
}

/**
 * Remove a client (call on SSE disconnect / cancel).
 */
export function unregisterFeedClient(tenantId: number, controller: FeedController): void {
  feedClients.get(tenantId)?.delete(controller);
}

/**
 * Broadcast an SSE event to all registered clients for a tenant.
 * Stale/errored controllers are pruned automatically.
 */
export function broadcastFeedUpdate(
  tenantId: number,
  eventName: string,
  data: unknown,
): void {
  const clients = feedClients.get(tenantId);
  if (!clients || clients.size === 0) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  const dead: FeedController[] = [];

  for (const ctrl of clients) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      dead.push(ctrl);
    }
  }

  for (const ctrl of dead) {
    clients.delete(ctrl);
  }
}
