'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RankInfo = {
  id: string;
  label: string;
  tagline: string;
  color: string;
  isApex: boolean;
  archonReady: boolean;
  archonGap: Record<string, number> | null;
};

type ProgressSummary = {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpForNext: number;
  levelPct: number;
  rank?: RankInfo;
  streak: {
    current: number;
    longest: number;
    multiplier: number;
    freezeCharges: number;
  };
};

const fallback: ProgressSummary = {
  totalXp: 0,
  level: 0,
  xpInLevel: 0,
  xpForNext: 200,
  levelPct: 0,
  streak: { current: 0, longest: 0, multiplier: 1, freezeCharges: 0 },
};

export function NavbarArenaProgress() {
  const [summary, setSummary] = useState<ProgressSummary>(fallback);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/arena/progress-summary', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as ProgressSummary;
      setSummary(data);
    } catch {
      /* keep fallback */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const openArenaTab = () => {
    const tab = document.querySelector<HTMLButtonElement>("button[role='tab'][value='progress']");
    tab?.click();
  };

  const rank        = summary.rank;
  const isArchon    = rank?.isApex === true;
  const isStratos   = rank?.id === 'stratos';
  const rankLabel   = rank?.label ?? `Level ${summary.level}`;
  const rankColor   = rank?.color ?? '#6366f1';
  const rankTagline = rank?.tagline ?? '';

  const streakOn   = summary.streak.current > 0;
  const xpRemaining = Math.max(0, summary.xpForNext - summary.xpInLevel);

  const streakTitle = `${summary.streak.current}-day streak · ${summary.streak.multiplier.toFixed(2)}× XP · 🧊 ${summary.streak.freezeCharges} freeze${summary.streak.freezeCharges !== 1 ? 's' : ''}`;

  const RANK_SEQUENCE = ['recruit','operator','commander','tactician','strategist','warlord','stratos','archon'] as const;
  const RANK_LABELS   = ['Operator','Commander','Tactician','Strategist','Warlord','Stratos','Archon'] as const;
  const currentIdx    = rank?.id ? RANK_SEQUENCE.indexOf(rank.id as typeof RANK_SEQUENCE[number]) : -1;
  const nextRankName  = currentIdx >= 0 && currentIdx < RANK_SEQUENCE.length - 1 ? RANK_LABELS[currentIdx] : 'next rank';

  const rankTitle = isArchon
    ? `Archon — Ruler of all. ${summary.totalXp.toLocaleString()} XP`
    : rank?.archonReady
    ? `${rankLabel} · ${summary.totalXp.toLocaleString()} XP — Archon XP met! Complete remaining criteria.`
    : `${rankLabel} · ${summary.totalXp.toLocaleString()} XP · ${xpRemaining} XP to ${nextRankName}`;

  const flameClass = useMemo(
    () => streakOn
      ? 'border-orange-700/60 bg-orange-950/40 text-orange-300 hover:text-orange-200'
      : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-400',
    [streakOn],
  );

  return (
    <div className="flex items-center gap-2">
      {/* Streak flame */}
      <button
        type="button"
        title={streakTitle}
        onClick={openArenaTab}
        className={`flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${flameClass}`}
      >
        <span aria-hidden>{streakOn ? '🔥' : '🕯️'}</span>
        <span>{summary.streak.current}</span>
      </button>

      {/* Rank badge */}
      <button
        type="button"
        title={`${rankTagline} ${rankTitle}`}
        onClick={openArenaTab}
        className={[
          'flex h-8 min-w-[84px] flex-col items-start justify-center rounded-md border px-2 text-[10px] transition-all',
          isArchon
            ? 'border-yellow-500/60 bg-yellow-950/30 text-yellow-400 shadow-[0_0_8px_rgba(245,158,11,0.35)] hover:shadow-[0_0_14px_rgba(245,158,11,0.55)]'
            : isStratos
            ? 'border-violet-600/60 bg-violet-950/30 text-violet-300 shadow-[0_0_6px_rgba(124,58,237,0.30)] hover:shadow-[0_0_12px_rgba(124,58,237,0.50)]'
            : rank?.archonReady
            ? 'border-amber-600/50 bg-amber-950/20 text-amber-400'
            : 'border-gray-700 bg-gray-900',
        ].join(' ')}
        style={!isArchon && !isStratos && !rank?.archonReady ? { color: rankColor } : undefined}
      >
        <span className="leading-none font-semibold">
          {isArchon ? '👑 Archon' : rankLabel}
        </span>
        {!isArchon && (
          <span className="mt-1 h-1 w-full rounded bg-gray-800">
            <span
              className="block h-1 rounded transition-all"
              style={{ width: `${summary.levelPct}%`, background: rankColor }}
            />
          </span>
        )}
        {isArchon && (
          <span className="mt-0.5 text-[9px] text-yellow-600 leading-none">Ruler of all</span>
        )}
      </button>
    </div>
  );
}
