type ReactionBurstProps = {
  active: boolean;
  reducedMotion?: boolean;
};

export function ReactionBurst({ active, reducedMotion }: ReactionBurstProps) {
  if (!active) return null;

  if (reducedMotion) {
    return <span className="pointer-events-none absolute inset-0 animate-pulse rounded-md bg-white/10" aria-hidden="true" />;
  }

  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, idx) => {
        const angle = (idx / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 18;
        const y = Math.sin(angle) * 18;
        return (
          <span
            key={idx}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300/90"
            style={{
              animation: 'arena-reaction-burst 650ms ease-out forwards',
              ['--tx' as string]: `${x}px`,
              ['--ty' as string]: `${y}px`,
            }}
          />
        );
      })}
    </span>
  );
}
