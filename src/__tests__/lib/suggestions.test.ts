import { getEmptyBoardSuggestions } from '@/lib/kanban/suggestions';

describe('kanban empty-board suggestions', () => {
  it('returns the built-in templates', () => {
    const suggestions = getEmptyBoardSuggestions('free');

    expect(suggestions.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Getting Started', 'Feature Sprint', 'Bug Triage']),
    );
  });

  it('returns suggestion items with template tasks', () => {
    const suggestions = getEmptyBoardSuggestions('pro');

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    for (const suggestion of suggestions) {
      expect(suggestion.description.length).toBeGreaterThan(0);
      expect(Array.isArray(suggestion.templateTasks)).toBe(true);
      expect(suggestion.templateTasks.length).toBeGreaterThan(0);
      for (const task of suggestion.templateTasks) {
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.status.length).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to defaults for unknown plans', () => {
    const known = getEmptyBoardSuggestions('free');
    const unknown = getEmptyBoardSuggestions('enterprise-legacy');

    expect(unknown).toEqual(known);
  });
});
