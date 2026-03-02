export type Suggestion = {
  title: string;
  description: string;
  templateTasks: { title: string; status: string }[];
};

const BASE_SUGGESTIONS: Suggestion[] = [
  {
    title: 'Getting Started',
    description: 'Set up your first mission with clear kickoff tasks.',
    templateTasks: [
      { title: 'Define mission objective', status: 'backlog' },
      { title: 'Connect gateway and keys', status: 'in_progress' },
      { title: 'Ship your first task', status: 'review' },
    ],
  },
  {
    title: 'Feature Sprint',
    description: 'Run a focused sprint from planning through QA.',
    templateTasks: [
      { title: 'Write feature brief', status: 'backlog' },
      { title: 'Implement core flow', status: 'in_progress' },
      { title: 'Run QA + regression checks', status: 'review' },
    ],
  },
  {
    title: 'Bug Triage',
    description: 'Stabilize quality with triage, fix, and verification.',
    templateTasks: [
      { title: 'Collect top bug reports', status: 'backlog' },
      { title: 'Fix highest-priority bugs', status: 'in_progress' },
      { title: 'Verify fixes in staging', status: 'review' },
    ],
  },
];

const TEAM_SUGGESTION: Suggestion = {
  title: 'Team Sync',
  description: 'Coordinate cross-functional handoffs for larger teams.',
  templateTasks: [
    { title: 'Align owners for each lane', status: 'backlog' },
    { title: 'Run daily async status update', status: 'in_progress' },
    { title: 'Review blockers with stakeholders', status: 'review' },
  ],
};

export function getEmptyBoardSuggestions(tenantPlan: string): Suggestion[] {
  const plan = (tenantPlan || '').toLowerCase();
  const suggestions = BASE_SUGGESTIONS.map((item) => ({
    ...item,
    templateTasks: item.templateTasks.map((task) => ({ ...task })),
  }));

  if (plan === 'team') {
    suggestions.push({
      ...TEAM_SUGGESTION,
      templateTasks: TEAM_SUGGESTION.templateTasks.map((task) => ({ ...task })),
    });
  }

  return suggestions;
}
