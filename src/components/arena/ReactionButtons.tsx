'use client';

import { useMemo, useState } from 'react';
import { ReactionBurst } from '@/components/arena/ReactionBurst';
import type { ArenaReactionCounts, ArenaReactionType } from '@/lib/arena-reactions';

const REACTIONS: Array<{ key: ArenaReactionType; label: string; icon: string }> = [
  { key: 'tribute', label: 'Tribute', icon: '🔥' },
  { key: 'respect', label: 'Respect', icon: '💪' },
  { key: 'hype', label: 'Hype', icon: '⚡' },
];

type ReactionButtonsProps = {
  toTenantId: number;
  currentTenantId: number | null;
  counts: ArenaReactionCounts;
  onCountsUpdated: (next: ArenaReactionCounts) => void;
  animationsEnabled: boolean;
};

export function ReactionButtons({
  toTenantId,
  currentTenantId,
  counts,
  onCountsUpdated,
  animationsEnabled,
}: ReactionButtonsProps) {
  const [activeBurstKey, setActiveBurstKey] = useState<ArenaReactionType | null>(null);
  const [sending, setSending] = useState<ArenaReactionType | null>(null);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const disabledSelf = currentTenantId === toTenantId;

  const react = async (reactionType: ArenaReactionType) => {
    if (disabledSelf || sending) return;
    setSending(reactionType);
    if (animationsEnabled) {
      setActiveBurstKey(reactionType);
      setTimeout(() => setActiveBurstKey(null), 650);
    }

    try {
      const res = await fetch('/api/arena/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toTenantId, reactionType }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { counts?: ArenaReactionCounts };
      if (json.counts) onCountsUpdated(json.counts);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {REACTIONS.map((reaction) => (
        <button
          key={reaction.key}
          type="button"
          disabled={disabledSelf || Boolean(sending)}
          onClick={() => void react(reaction.key)}
          className="relative inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ReactionBurst active={activeBurstKey === reaction.key && animationsEnabled} reducedMotion={reducedMotion} />
          <span>{reaction.label}</span>
          <span>{reaction.icon}</span>
          <span className="text-gray-400">{counts[reaction.key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
