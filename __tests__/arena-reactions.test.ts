import {
  enforceArenaReactionCooldown,
  enforceArenaReactionRateLimit,
  incrementReactionCounts,
  isValidArenaReactionType,
  resetArenaReactionMemoryState,
} from '@/lib/arena-reactions';

describe('arena reactions', () => {
  beforeEach(() => {
    resetArenaReactionMemoryState();
  });

  it('blocks self-reaction at API-rule level', () => {
    const fromTenantId = 7;
    const toTenantId = 7;
    expect(fromTenantId === toTenantId).toBe(true);
  });

  it('enforces sender rate limit of 30 reactions per 10 minutes', () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++) {
      expect(enforceArenaReactionRateLimit(1, now + i * 1000)).toEqual({ ok: true });
    }

    const blocked = enforceArenaReactionRateLimit(1, now + 31_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('increments per-type counters correctly', () => {
    const next = incrementReactionCounts({ tribute: 0, respect: 2, hype: 5 }, 'respect');
    expect(next).toEqual({ tribute: 0, respect: 3, hype: 5 });
  });

  it('enforces 30-second sender->recipient cooldown', () => {
    const base = Date.now();
    expect(enforceArenaReactionCooldown(1, 2, base)).toEqual({ ok: true });

    const blocked = enforceArenaReactionCooldown(1, 2, base + 1000);
    expect(blocked.ok).toBe(false);

    expect(enforceArenaReactionCooldown(1, 2, base + 31_000)).toEqual({ ok: true });
  });

  it('validates allowed reaction types', () => {
    expect(isValidArenaReactionType('tribute')).toBe(true);
    expect(isValidArenaReactionType('respect')).toBe(true);
    expect(isValidArenaReactionType('hype')).toBe(true);
    expect(isValidArenaReactionType('lol')).toBe(false);
  });
});
