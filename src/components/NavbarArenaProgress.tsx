'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ProgressSummary = {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpForNext: number;
  levelPct: number;
  streak: {
    current: number;
    longest: number;
    multiplier: number;
    freezeCharges: number;
  };
};

const fallback: ProgressSummary = {
  totalXp: 0,
  level: 1,
  xpInLevel: 0,
  xpForNext: 100,
  levelPct: 0,
  streak: { current: 0, longest: 0, multiplier: 1, freezeCharges: 0 },
};

export function NavbarArenaProgress() {
  const [summary, setSummary] = useState<ProgressSummary>(fallback);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/arena/progress-summary', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as ProgressSummary;
      setSummary(data);
    } catch {
      setSummary(fallback);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  const streakTitle = `${summary.streak.current}-day streak · ${summary.streak.multiplier.toFixed(2)}× XP multiplier · 🧊 ${summary.streak.freezeCharges} freezes`;
  const xpRemaining = Math.max(0, summary.xpForNext - summary.xpInLevel);
  const xpTitle = `${summary.totalXp} XP · ${xpRemaining} XP to Level ${summary.level + 1}`;

  const flameClassName = useMemo(
    () => (summary.streak.current > 0
      ? 'border-orange-700/60 bg-orange-950/40 text-orange-300 hover:text-orange-200'
      : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-400'),
    [summary.streak.current],
  );

  const openArenaTab = () => {
    const arenaTab = document.querySelector<HTMLButtonElement>("button[role='tab'][value='progress']");
    arenaTab?.click();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title={streakTitle}
        onClick={openArenaTab}
        className={`flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${flameClassName}`}
      >
        <span aria-hidden>🔥</span>
        <span>{summary.streak.current}</span>
      </button>

      <button
        type="button"
        title={xpTitle}
        onClick={openArenaTab}
        className="flex h-8 min-w-[74px] flex-col items-start justify-center rounded-md border border-indigo-800/60 bg-gray-900 px-2 text-[10px] text-indigo-400"
      >
        <span className="leading-none">Lvl {summary.level}</span>
        <span className="mt-1 h-1 w-full rounded bg-gray-800">
          <span className="block h-1 rounded bg-indigo-500" style={{ width: `${summary.levelPct}%` }} />
        </span>
      </button>
    </div>
  );
}
