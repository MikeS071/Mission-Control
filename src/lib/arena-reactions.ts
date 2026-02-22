export const ARENA_REACTION_TYPES = ['tribute', 'respect', 'hype'] as const;
export type ArenaReactionType = (typeof ARENA_REACTION_TYPES)[number];

export type ArenaReactionCounts = {
  tribute: number;
  respect: number;
  hype: number;
};

export type ArenaReactionCreatedEvent = {
  type: 'arena.reaction.created';
  toTenantId: number;
  fromTenantId: number;
  reactionType: ArenaReactionType;
  counts: ArenaReactionCounts;
  createdAt: string;
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const PAIR_COOLDOWN_MS = 30 * 1000;

type SenderWindow = { timestamps: number[] };
const senderReactionWindows = new Map<number, SenderWindow>();
const pairCooldowns = new Map<string, number>();

const reactionSubscribers = new Set<(event: ArenaReactionCreatedEvent) => void>();

export function subscribeToArenaReactionEvents(cb: (event: ArenaReactionCreatedEvent) => void): () => void {
  reactionSubscribers.add(cb);
  return () => reactionSubscribers.delete(cb);
}

export function emitArenaReactionCreated(event: ArenaReactionCreatedEvent) {
  for (const cb of reactionSubscribers) {
    cb(event);
  }
}

export function enforceArenaReactionRateLimit(fromTenantId: number, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
  const senderWindow = senderReactionWindows.get(fromTenantId) ?? { timestamps: [] };
  senderWindow.timestamps = senderWindow.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (senderWindow.timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = senderWindow.timestamps[0] ?? now;
    return { ok: false, retryAfterMs: Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - oldest)) };
  }

  senderWindow.timestamps.push(now);
  senderReactionWindows.set(fromTenantId, senderWindow);
  return { ok: true };
}

export function enforceArenaReactionCooldown(fromTenantId: number, toTenantId: number, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
  const key = `${fromTenantId}:${toTenantId}`;
  const last = pairCooldowns.get(key);
  if (typeof last === 'number' && now - last < PAIR_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: PAIR_COOLDOWN_MS - (now - last) };
  }
  pairCooldowns.set(key, now);
  return { ok: true };
}

export function incrementReactionCounts(
  counts: ArenaReactionCounts,
  reactionType: ArenaReactionType,
): ArenaReactionCounts {
  return {
    ...counts,
    [reactionType]: (counts[reactionType] ?? 0) + 1,
  };
}

export function isValidArenaReactionType(value: string): value is ArenaReactionType {
  return (ARENA_REACTION_TYPES as readonly string[]).includes(value);
}

export function resetArenaReactionMemoryState() {
  senderReactionWindows.clear();
  pairCooldowns.clear();
  reactionSubscribers.clear();
}
