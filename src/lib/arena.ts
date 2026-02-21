// ─────────────────────────────────────────────────────────────────────────────
// ArchonHQ Arena — shared XP / rank / streak / milestone logic
// ─────────────────────────────────────────────────────────────────────────────

// ── Rank system ───────────────────────────────────────────────────────────────
//
// Seven ranks. Archon is the pinnacle — XP threshold alone is not enough.
// You must also satisfy ARCHON_CRITERIA to be elevated.
//
export type RankId = 'recruit' | 'operator' | 'commander' | 'tactician' | 'strategist' | 'warlord' | 'stratos' | 'archon';

export type Rank = {
  id:       RankId;
  index:    number;    // 0–6
  label:    string;    // display name
  tagline:  string;    // flavour text
  xpFloor:  number;    // minimum XP to reach this rank (ignoring special criteria)
  color:    string;    // hex accent colour for UI
  isApex:   boolean;   // true only for Archon
};

export const RANKS: Rank[] = [
  { index: 0, id: 'recruit',    label: 'Recruit',    tagline: 'Just awakened.',                           xpFloor: 0,      color: '#6b7280', isApex: false },
  { index: 1, id: 'operator',   label: 'Operator',   tagline: 'Hands on the controls.',                  xpFloor: 200,    color: '#38bdf8', isApex: false },
  { index: 2, id: 'commander',  label: 'Commander',  tagline: 'Taking command.',                          xpFloor: 600,    color: '#34d399', isApex: false },
  { index: 3, id: 'tactician',  label: 'Tactician',  tagline: 'Thinking three moves ahead.',             xpFloor: 1_500,  color: '#a78bfa', isApex: false },
  { index: 4, id: 'strategist', label: 'Strategist', tagline: 'Playing the long game.',                  xpFloor: 4_000,  color: '#f472b6', isApex: false },
  { index: 5, id: 'warlord',    label: 'Warlord',    tagline: 'Dominant force. Few reach this far.',           xpFloor: 10_000, color: '#fb923c', isApex: false },
  { index: 6, id: 'stratos',    label: 'Stratos',    tagline: 'Above the clouds. One summit remains.',         xpFloor: 18_000, color: '#7c3aed', isApex: false },
  { index: 7, id: 'archon',     label: 'Archon',     tagline: 'Ruler of all. You are the exception.',          xpFloor: 25_000, color: '#f59e0b', isApex: true  },
];

// ── Archon multi-criteria gate ────────────────────────────────────────────────
//
// XP alone is insufficient. All three must be satisfied simultaneously.
//
export type ArchonCriteria = {
  xpRequired:          number;   // 25,000 XP
  longestStreakDays:   number;   // must have achieved a 100-day streak at some point
  totalTasksDone:      number;   // 500 completed tasks
  arcsCompleted:       number;   // at least 1 seasonal Arc claimed
};

export const ARCHON_CRITERIA: ArchonCriteria = {
  xpRequired:        25_000,
  longestStreakDays:    100,
  totalTasksDone:       500,
  arcsCompleted:          1,
};

export function isArchonEligible(opts: {
  totalXp:          number;
  longestStreak:    number;
  totalTasksDone:   number;
  arcsCompleted:    number;
}): boolean {
  return (
    opts.totalXp        >= ARCHON_CRITERIA.xpRequired       &&
    opts.longestStreak  >= ARCHON_CRITERIA.longestStreakDays &&
    opts.totalTasksDone >= ARCHON_CRITERIA.totalTasksDone    &&
    opts.arcsCompleted  >= ARCHON_CRITERIA.arcsCompleted
  );
}

// ── Rank resolution ───────────────────────────────────────────────────────────

export type RankState = {
  rank:        Rank;
  xpInRank:    number;   // XP earned above this rank's floor
  xpForNext:   number;   // XP needed to reach next rank floor (0 if apex)
  pct:         number;   // progress to next rank, 0–100
  archonReady: boolean;  // XP threshold met but special criteria not yet satisfied
  archonGap:   Partial<ArchonCriteria> | null;  // missing criteria (null if Archon)
};

export function xpToRank(
  totalXp: number,
  opts?: { longestStreak?: number; totalTasksDone?: number; arcsCompleted?: number }
): RankState {
  const xp = Math.max(0, Math.floor(totalXp));

  // Find highest non-apex rank achievable by XP alone
  let baseRankIndex = 0;
  for (let i = 0; i < RANKS.length - 1; i++) {
    if (xp >= RANKS[i].xpFloor) baseRankIndex = i;
  }

  // Check Archon (apex)
  const longestStreak  = opts?.longestStreak  ?? 0;
  const totalTasksDone = opts?.totalTasksDone ?? 0;
  const arcsCompleted  = opts?.arcsCompleted  ?? 0;

  const archonXpMet = xp >= ARCHON_CRITERIA.xpRequired;
  const archonFull  = archonXpMet && isArchonEligible({ totalXp: xp, longestStreak, totalTasksDone, arcsCompleted });

  if (archonFull) {
    const archonRank = RANKS[6];
    return { rank: archonRank, xpInRank: xp - archonRank.xpFloor, xpForNext: 0, pct: 100, archonReady: false, archonGap: null };
  }

  const rank    = RANKS[baseRankIndex];
  const next    = RANKS[baseRankIndex + 1];
  const xpInRank  = xp - rank.xpFloor;
  const xpForNext = next ? next.xpFloor - rank.xpFloor : 0;
  const pct       = xpForNext > 0 ? Math.min(100, Math.round((xpInRank / xpForNext) * 100)) : 100;

  // Compute Archon gap if XP threshold met but criteria missing
  const archonGap: Partial<ArchonCriteria> | null = archonXpMet
    ? {
        ...(longestStreak  < ARCHON_CRITERIA.longestStreakDays ? { longestStreakDays: ARCHON_CRITERIA.longestStreakDays - longestStreak } : {}),
        ...(totalTasksDone < ARCHON_CRITERIA.totalTasksDone    ? { totalTasksDone: ARCHON_CRITERIA.totalTasksDone - totalTasksDone }       : {}),
        ...(arcsCompleted  < ARCHON_CRITERIA.arcsCompleted     ? { arcsCompleted: ARCHON_CRITERIA.arcsCompleted - arcsCompleted }         : {}),
      }
    : null;

  return { rank, xpInRank, xpForNext, pct, archonReady: archonXpMet && !archonFull, archonGap };
}

// Keep old name as alias for backwards compat with any callers that use it
export function xpToLevel(totalXp: number) {
  const s = xpToRank(totalXp);
  return {
    level:      s.rank.index,
    xpInLevel:  s.xpInRank,
    xpForNext:  s.xpForNext,
    pct:        s.pct,
  };
}

// ── Streak multiplier ─────────────────────────────────────────────────────────

export function streakDaysToMultiplier(days: number): number {
  if (days >= 100) return 1.6;
  if (days >= 60)  return 1.5;
  if (days >= 30)  return 1.35;
  if (days >= 14)  return 1.2;
  if (days >= 7)   return 1.1;
  if (days >= 3)   return 1.05;
  return 1.0;
}

// ── Milestones ────────────────────────────────────────────────────────────────

export type ArenaMilestoneMetric =
  | 'total_tasks_done'
  | 'longest_streak'
  | 'deploys_count'
  | 'cost_saved_cents'
  | 'arcs_completed'
  | 'total_xp';

export type ArenaMilestone = {
  id:        string;
  label:     string;
  desc:      string;
  icon:      string;
  threshold: number;
  metric:    ArenaMilestoneMetric;
  isApex?:   boolean;
};

export const MILESTONES: ArenaMilestone[] = [
  // Task milestones
  { id: 'first_task',    label: 'First Blood',   desc: 'Complete your first task',    icon: '⚔️',  threshold: 1,   metric: 'total_tasks_done' },
  { id: 'ten_tasks',     label: 'Momentum',      desc: 'Complete 10 tasks',           icon: '💥',  threshold: 10,  metric: 'total_tasks_done' },
  { id: 'hundred_tasks', label: 'Centurion',     desc: 'Complete 100 tasks',          icon: '🏆',  threshold: 100, metric: 'total_tasks_done' },
  { id: 'five_hundred',  label: 'Legion',        desc: 'Complete 500 tasks',          icon: '⚜️',  threshold: 500, metric: 'total_tasks_done' },
  // Streak milestones
  { id: 'streak_7',      label: 'Week Warrior',  desc: '7-day streak',                icon: '🔥',  threshold: 7,   metric: 'longest_streak'   },
  { id: 'streak_30',     label: 'Ironclad',      desc: '30-day streak',               icon: '⚡',  threshold: 30,  metric: 'longest_streak'   },
  { id: 'streak_100',    label: 'Unstoppable',   desc: '100-day streak',              icon: '💎',  threshold: 100, metric: 'longest_streak'   },
  // Ops milestones
  { id: 'first_deploy',  label: 'Deployed',      desc: 'First successful deploy',     icon: '🚀',  threshold: 1,   metric: 'deploys_count'    },
  { id: 'cost_saver',    label: 'Efficient',     desc: 'Save $1 vs baseline routing', icon: '💰',  threshold: 100, metric: 'cost_saved_cents' },
  { id: 'arc_complete',  label: 'Arc Bearer',    desc: 'Complete a 30-day season Arc',icon: '🌌',  threshold: 1,   metric: 'arcs_completed'   },
  // Elite tier
  {
    id:        'stratos',
    label:     'Stratos',
    desc:      'Reach the Stratos rank — 18,000 XP. Above the clouds.',
    icon:      '🌌',
    threshold: 18_000,
    metric:    'total_xp',
  },
  // Apex
  {
    id:        'archon',
    label:     'Archon',
    desc:      'Ruler of all. 25,000 XP + 100-day streak + 500 tasks + 1 Arc. You earned it.',
    icon:      '👑',
    threshold: 1,
    metric:    'arcs_completed',  // proxy — real check uses isArchonEligible
    isApex:    true,
  },
];
