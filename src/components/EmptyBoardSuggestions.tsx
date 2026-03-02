'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getEmptyBoardSuggestions, Suggestion } from '@/lib/kanban/suggestions';

export type TemplateTaskInput = { title: string; status: string };

export async function createTemplateTasks(
  templateTasks: TemplateTaskInput[],
  fetchImpl: typeof fetch = fetch,
): Promise<unknown[]> {
  if (templateTasks.length === 0) return [];

  const created: unknown[] = [];
  for (const task of templateTasks) {
    const response = await fetchImpl('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: task.title, status: task.status }),
    });

    if (!response.ok) {
      let message = 'Failed to create template tasks';
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // noop
      }
      throw new Error(message);
    }

    created.push(await response.json());
  }

  return created;
}

type EmptyBoardSuggestionsProps = {
  tenantPlan: string;
  onTemplateApplied?: (createdTasks: unknown[], suggestion: Suggestion) => void | Promise<void>;
  onError?: (message: string) => void;
};

export function EmptyBoardSuggestions({ tenantPlan, onTemplateApplied, onError }: EmptyBoardSuggestionsProps) {
  const [runningTemplate, setRunningTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useMemo(() => getEmptyBoardSuggestions(tenantPlan), [tenantPlan]);

  const useTemplate = async (suggestion: Suggestion) => {
    setError(null);
    setRunningTemplate(suggestion.title);

    try {
      const created = await createTemplateTasks(suggestion.templateTasks);
      await onTemplateApplied?.(created, suggestion);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply template';
      setError(message);
      onError?.(message);
    } finally {
      setRunningTemplate(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">Start from a template</h3>
        <p className="text-xs text-gray-400">Your board is empty. Pick a starting set of tasks.</p>
      </div>

      {error && <div className="mb-3 rounded border border-red-800 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">{error}</div>}

      <div className="grid gap-3 md:grid-cols-3">
        {suggestions.map((suggestion) => {
          const running = runningTemplate === suggestion.title;
          return (
            <Card key={suggestion.title} className="border-gray-700/70 bg-gray-950/70 py-3">
              <CardHeader className="px-3 pb-2">
                <CardTitle className="text-sm text-white">{suggestion.title}</CardTitle>
                <CardDescription className="text-xs text-gray-400">{suggestion.description}</CardDescription>
              </CardHeader>
              <CardContent className="px-3">
                <ul className="space-y-1 text-[11px] text-gray-400">
                  {suggestion.templateTasks.map((task) => (
                    <li key={`${suggestion.title}-${task.title}`}>• {task.title}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="px-3 pt-0">
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={runningTemplate !== null}
                  onClick={() => void useTemplate(suggestion)}
                >
                  {running ? 'Creating…' : 'Use Template'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
