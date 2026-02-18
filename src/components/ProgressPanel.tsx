'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type Summary = {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  rank: number;
  activeChallenges: number;
};

type Challenge = {
  id: number;
  title: string;
  description: string;
  xpReward: number;
  status: string;
  dueDate: string | null;
};

type LeaderboardRow = {
  tenantSlug: string;
  totalXp: number;
  level: number;
};

const emptySummary: Summary = {
  totalXp: 0,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  rank: 1,
  activeChallenges: 0,
};

export function ProgressPanel() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  const load = useCallback(async () => {
    const [summaryRes, challengesRes, leaderboardRes] = await Promise.all([
      fetch('/api/gamification/summary', { cache: 'no-store' }),
      fetch('/api/gamification/challenges', { cache: 'no-store' }),
      fetch('/api/gamification/leaderboard', { cache: 'no-store' }),
    ]);

    if (summaryRes.ok) setSummary((await summaryRes.json()) as Summary);
    if (challengesRes.ok) setChallenges((await challengesRes.json()) as Challenge[]);
    if (leaderboardRes.ok) setLeaderboard((await leaderboardRes.json()) as LeaderboardRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const progressPercent = useMemo(() => Math.max(0, Math.min(100, summary.totalXp % 100)), [summary.totalXp]);
  const activeChallenges = useMemo(() => challenges.filter((challenge) => challenge.status === 'active'), [challenges]);

  const completeChallenge = async (id: number) => {
    await fetch(`/api/gamification/challenges/${id}/complete`, {
      method: 'POST',
    });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
          <span>Level {summary.level} · {summary.totalXp} XP</span>
          <span>Rank #{summary.rank}</span>
        </div>
        <div className="h-3 w-full rounded-full bg-gray-800">
          <div className="h-3 rounded-full bg-indigo-500 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="mt-3 text-sm text-gray-300">
          <span className="mr-4">🔥 Current streak: <b>{summary.currentStreak}</b></span>
          <span>Longest streak: <b>{summary.longestStreak}</b></span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Active Challenges ({activeChallenges.length})</h3>
          <div className="space-y-2">
            {activeChallenges.length === 0 && <p className="text-sm text-gray-400">No active challenges.</p>}
            {activeChallenges.map((challenge) => (
              <div key={challenge.id} className="rounded border border-gray-700 bg-gray-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{challenge.title}</p>
                    {challenge.description && <p className="mt-1 text-xs text-gray-400">{challenge.description}</p>}
                    <p className="mt-1 text-xs text-indigo-300">+{challenge.xpReward} XP</p>
                  </div>
                  <Button size="sm" onClick={() => void completeChallenge(challenge.id)}>Complete</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Leaderboard (Top 5)</h3>
          <div className="space-y-2">
            {leaderboard.slice(0, 5).map((row, idx) => (
              <div key={row.tenantSlug} className="flex items-center justify-between rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm">
                <span className="text-gray-300">#{idx + 1} {row.tenantSlug}</span>
                <span className="text-white">Lvl {row.level} · {row.totalXp} XP</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
