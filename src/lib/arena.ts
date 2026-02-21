export const LEVELS = [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000] as const;

export type ArenaMilestoneMetric =
  | 'total_tasks_done'
  | 'longest_streak'
  | 'deploys_count'
  | 'cost_saved_cents';

export type ArenaMilestone = {
  id: string;
  label: string;
  desc: string;
  icon: string;
  threshold: number;
  metric: ArenaMilestoneMetric;
};

export const MILESTONES: ArenaMilestone[] = [
  { id: 'first_task', label: 'First Blood', desc: 'Complete your first task', icon: '⚔️', threshold: 1, metric: 'total_tasks_done' },
  { id: 'ten_tasks', label: 'Momentum', desc: 'Complete 10 tasks', icon: '💥', threshold: 10, metric: 'total_tasks_done' },
  { id: 'hundred_tasks', label: 'Centurion', desc: 'Complete 100 tasks', icon: '🏆', threshold: 100, metric: 'total_tasks_done' },
  { id: 'streak_7', label: 'Week Warrior', desc: '7-day streak', icon: '🔥', threshold: 7, metric: 'longest_streak' },
  { id: 'streak_30', label: 'Ironclad', desc: '30-day streak', icon: '⚡', threshold: 30, metric: 'longest_streak' },
  { id: 'streak_100', label: 'Unstoppable', desc: '100-day streak', icon: '💎', threshold: 100, metric: 'longest_streak' },
  { id: 'first_deploy', label: 'Deployed', desc: 'First successful deploy', icon: '🚀', threshold: 1, metric: 'deploys_count' },
  { id: 'cost_saver', label: 'Efficient', desc: 'Save $1 vs baseline routing', icon: '💰', threshold: 100, metric: 'cost_saved_cents' },
];

export function streakDaysToMultiplier(days: number): number {
  if (days >= 100) return 1.6;
  if (days >= 60) return 1.5;
  if (days >= 30) return 1.35;
  if (days >= 14) return 1.2;
  if (days >= 7) return 1.1;
  if (days >= 3) return 1.05;
  return 1;
}

export function xpToLevel(totalXp: number): { level: number; xpInLevel: number; xpForNext: number; pct: number } {
  const safeXp = Math.max(0, Math.floor(totalXp));

  let level = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i]) {
      level = i;
    } else {
      break;
    }
  }

  const currentFloor = LEVELS[level] ?? 0;
  const nextThreshold = LEVELS[level + 1];
  if (nextThreshold === undefined) {
    return { level, xpInLevel: safeXp - currentFloor, xpForNext: 0, pct: 100 };
  }

  const xpInLevel = safeXp - currentFloor;
  const xpForNext = nextThreshold - currentFloor;
  const pct = xpForNext > 0 ? Math.min(100, Math.max(0, Math.round((xpInLevel / xpForNext) * 100))) : 0;

  return { level, xpInLevel, xpForNext, pct };
}
