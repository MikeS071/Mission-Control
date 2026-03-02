import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EmptyBoardSuggestions,
  createTemplateTasks,
  type TemplateTaskInput,
} from '@/components/EmptyBoardSuggestions';

function createFetchResponse(ok: boolean, payload: unknown = {}) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('EmptyBoardSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders built-in suggestion cards with Use Template actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(EmptyBoardSuggestions, {
        tenantPlan: 'free',
      }),
    );

    expect(html).toContain('Start from a template');
    expect(html).toContain('Getting Started');
    expect(html).toContain('Feature Sprint');
    expect(html).toContain('Bug Triage');
    expect((html.match(/Use Template/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('creates one task API call per template task', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(createFetchResponse(true, { id: 1 }));

    const tasks: TemplateTaskInput[] = [
      { title: 'Scope work', status: 'backlog' },
      { title: 'Build feature', status: 'in_progress' },
      { title: 'Ship', status: 'done' },
    ];

    const created = await createTemplateTasks(tasks, fetchMock as unknown as typeof fetch);

    expect(created).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Scope work', status: 'backlog' }),
      }),
    );
  });

  it('throws when template task creation fails', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(createFetchResponse(false, { error: 'Unauthorized' }));

    await expect(
      createTemplateTasks([{ title: 'Broken task', status: 'backlog' }], fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('Unauthorized');
  });

  it('does not call API for empty template task lists', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

    const created = await createTemplateTasks([], fetchMock as unknown as typeof fetch);

    expect(created).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
