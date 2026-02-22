'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReactionButtons } from '@/components/arena/ReactionButtons';
import { FloatingReactionOverlay } from '@/components/arena/FloatingReactionOverlay';
import type { ArenaReactionCounts, ArenaReactionType } from '@/lib/arena-reactions';

type Challenge = {
  id: number;
  type: 'daily' | 'weekly' | 'seasonal';
  title: string;
  description: string;
  reward_xp: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  current_value: number;
  target_value: number;
  status: 'active' | 'completed' | 'claimed' | 'expired';
  completion_pct: number;
};

type ChallengesResponse = { daily: Challenge[]; weekly: Challenge[]; seasonal: Challenge[] };
type Streak = { current_streak_days: number; longest_streak_days: number; xp_multiplier: number; freeze_charges: number };
type Season = { id: number; name: string; days_remaining: number; season_pct: number };
type Milestone = { id: string; label: string; icon: string; desc: string; unlocked: boolean; unlockedAt: string | null };
type ProgressSummary = { milestones: Milestone[] };
type LeaderboardRow = { tenantId: number; tenantSlug: string; totalXp: number; level: number };
type FloatingReaction = { id: string; tenantId: number; reactionType: ArenaReactionType };

const diffClass: Record<string, string> = {
  Easy: 'bg-green-900/40 text-green-300',
  Medium: 'bg-yellow-900/40 text-yellow-300',
  Hard: 'bg-red-900/40 text-red-300',
};

function BadgeGrid({ milestones }: { milestones: Milestone[] }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-300">── BADGES ──</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {milestones.map((badge) => {
          const unlockedLabel = badge.unlockedAt ? `\nUnlocked: ${new Date(badge.unlockedAt).toLocaleDateString()}` : '';
          const title = `${badge.label}: ${badge.desc}${unlockedLabel}`;
          return (
            <button
              key={badge.id}
              type="button"
              title={title}
              disabled={!badge.unlocked}
              className={`relative rounded-md border px-2 py-3 text-left transition-colors ${badge.unlocked
                ? 'border-indigo-800/70 bg-indigo-950/20 text-gray-200 hover:bg-indigo-900/25'
                : 'border-gray-800 bg-gray-950 text-gray-500'}`}
            >
              <span className={`text-lg ${badge.unlocked ? '' : 'blur-[1px] grayscale opacity-40'}`}>{badge.icon}</span>
              <p className="mt-1 truncate text-xs">{badge.label}</p>
              {badge.unlocked && <span className="absolute right-1 top-1 text-[10px] text-indigo-400">✓</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StreakBadge({ streak }: { streak: Streak }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-300">🔥 STREAK</p>
        <span className="rounded bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-300">{streak.xp_multiplier.toFixed(2)}×</span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-white">{streak.current_streak_days} days</p>
      <p className="mt-1 text-xs text-gray-400">Longest: {streak.longest_streak_days} days</p>
      <p className="mt-2 text-xs text-indigo-400">{'🧊'.repeat(Math.max(0, streak.freeze_charges)) || 'No freeze charges'}</p>
    </div>
  );
}

function SeasonBar({ season }: { season: Season | null }) {
  if (!season) {
    return <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">No active season.</div>;
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-gray-200">SEASON: {season.name}</span>
        <span className="text-gray-400">{season.days_remaining}d left</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800">
        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${season.season_pct}%` }} />
      </div>
    </div>
  );
}

function ChallengeCard({ challenge, onClaim }: { challenge: Challenge; onClaim: (id: number) => Promise<void> }) {
  const done = challenge.status === 'completed' || challenge.status === 'claimed';
  return (
    <div className={`rounded border p-3 ${done ? 'border-green-800 bg-green-950/20' : 'border-gray-800 bg-gray-950'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white">{done ? '✓' : '•'} {challenge.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${diffClass[challenge.difficulty]}`}>{challenge.difficulty}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">{challenge.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-indigo-300">{challenge.reward_xp} XP</p>
          {challenge.status === 'completed' && (
            <Button size="sm" className="mt-1 h-7" onClick={() => void onClaim(challenge.id)}>Claim</Button>
          )}
          {challenge.status === 'claimed' && <Button size="sm" className="mt-1 h-7" disabled>Claimed</Button>}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800">
        <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${challenge.completion_pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-500">{Number(challenge.current_value)} / {Number(challenge.target_value)}</p>
    </div>
  );
}

export function ArenaPanel() {
  const [data, setData] = useState<ChallengesResponse>({ daily: [], weekly: [], seasonal: [] });
  const [streak, setStreak] = useState<Streak>({ current_streak_days: 0, longest_streak_days: 0, xp_multiplier: 1, freeze_charges: 0 });
  const [season, setSeason] = useState<Season | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<number, ArenaReactionCounts>>({});
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<number | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s, z, p, l, session] = await Promise.all([
        fetch('/api/arena/challenges', { cache: 'no-store' }),
        fetch('/api/arena/streak', { cache: 'no-store' }),
        fetch('/api/arena/season', { cache: 'no-store' }),
        fetch('/api/arena/progress-summary', { cache: 'no-store' }),
        fetch('/api/gamification/leaderboard', { cache: 'no-store' }),
        fetch('/api/auth/session', { cache: 'no-store' }),
      ]);
      if (!c.ok || !s.ok || !p.ok) throw new Error('Arena API unavailable');
      setData((await c.json()) as ChallengesResponse);
      setStreak((await s.json()) as Streak);
      setSeason(z.ok ? ((await z.json()) as Season) : null);
      setMilestones(((await p.json()) as ProgressSummary).milestones ?? []);
      setLeaderboard(l.ok ? (await l.json()) as LeaderboardRow[] : []);

      if (session.ok) {
        const sessionJson = (await session.json()) as { tenantId?: number; user?: { settings?: { arenaReactionAnimations?: boolean } } };
        setCurrentTenantId(typeof sessionJson.tenantId === 'number' ? sessionJson.tenantId : null);
        setAnimationsEnabled(sessionJson.user?.settings?.arenaReactionAnimations !== false);
      }
      setError(null);
    } catch {
      setError('Unable to load Arena data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!leaderboard.length) return;

    void Promise.all(
      leaderboard.slice(0, 5).map(async (row) => {
        const res = await fetch(`/api/arena/reactions?toTenantId=${row.tenantId}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const counts = (await res.json()) as ArenaReactionCounts;
        return { tenantId: row.tenantId, counts };
      }),
    ).then((entries) => {
      const next: Record<number, ArenaReactionCounts> = {};
      for (const entry of entries) {
        if (!entry) continue;
        next[entry.tenantId] = entry.counts;
      }
      setReactionCounts(next);
    });
  }, [leaderboard]);

  useEffect(() => {
    const es = new EventSource('/api/arena/reactions/stream');
    const listener = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { toTenantId: number; reactionType: ArenaReactionType; counts: ArenaReactionCounts; createdAt: string };
      setReactionCounts((prev) => ({ ...prev, [payload.toTenantId]: payload.counts }));
      setFloatingReactions((prev) => [...prev, { id: `${payload.toTenantId}-${payload.createdAt}`, tenantId: payload.toTenantId, reactionType: payload.reactionType }]);
    };

    es.addEventListener('arena.reaction.created', listener as EventListener);
    return () => {
      es.removeEventListener('arena.reaction.created', listener as EventListener);
      es.close();
    };
  }, []);

  const claim = useCallback(async (progressId: number) => {
    await fetch('/api/arena/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progressId }),
    });
    await load();
  }, [load]);

  const groups = useMemo(() => [
    ['DAILY', data.daily],
    ['WEEKLY', data.weekly],
    ['SEASONAL ARC', data.seasonal],
  ] as const, [data]);

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>;
  }
  if (error) return <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>;

  return (
    <div className="space-y-4">
      <BadgeGrid milestones={milestones} />
      <StreakBadge streak={streak} />
      <SeasonBar season={season} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-300">── LEADERBOARD ──</h3>
        <div className="space-y-2">
          {leaderboard.slice(0, 5).map((row, idx) => {
            const counts = reactionCounts[row.tenantId] ?? { tribute: 0, respect: 0, hype: 0 };
            const total = counts.tribute + counts.respect + counts.hype;
            return (
              <div key={row.tenantId} className="relative rounded border border-gray-800 bg-gray-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-gray-200">#{idx + 1} {row.tenantSlug}</p>
                  <p className="text-xs text-gray-400">Lvl {row.level} · {row.totalXp} XP · {total} reacts</p>
                </div>
                <ReactionButtons
                  toTenantId={row.tenantId}
                  currentTenantId={currentTenantId}
                  counts={counts}
                  animationsEnabled={animationsEnabled}
                  onCountsUpdated={(next) => setReactionCounts((prev) => ({ ...prev, [row.tenantId]: next }))}
                />
                {floatingReactions
                  .filter((r) => r.tenantId === row.tenantId)
                  .map((r) => (
                    <FloatingReactionOverlay
                      key={r.id}
                      id={r.id}
                      reactionType={r.reactionType}
                      onDone={(id) => setFloatingReactions((prev) => prev.filter((item) => item.id !== id))}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </section>

      {groups.map(([label, list]) => (
        <section key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-gray-300">── {label} ──</h3>
          <div className="space-y-2">
            {list.length === 0
              ? <p className="text-sm text-gray-500">No active challenges.</p>
              : list.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} onClaim={claim} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
