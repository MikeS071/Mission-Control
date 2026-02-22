import { useEffect, useState } from 'react';
import type { ArenaReactionType } from '@/lib/arena-reactions';

const reactionEmoji: Record<ArenaReactionType, string> = {
  tribute: '🔥',
  respect: '💪',
  hype: '⚡',
};

type FloatingReactionOverlayProps = {
  reactionType: ArenaReactionType;
  id: string;
  onDone: (id: string) => void;
};

export function FloatingReactionOverlay({ reactionType, id, onDone }: FloatingReactionOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone(id);
    }, 900);

    return () => clearTimeout(timer);
  }, [id, onDone]);

  if (!visible) return null;

  return (
    <span
      className="pointer-events-none absolute right-2 top-2 text-xl"
      style={{ animation: 'arena-reaction-float 900ms ease-out forwards' }}
      aria-hidden="true"
    >
      {reactionEmoji[reactionType]}
    </span>
  );
}
