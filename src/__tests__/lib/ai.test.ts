import { generatePrdMarkdown, updatePrdMarkdown } from '@/lib/prd-ai';
import { generateChecklistItems, parseChecklist, stringifyChecklist } from '@/lib/checklist-ai';

function createFetchResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function createInsertBuilder() {
  const values = jest.fn().mockResolvedValue(undefined);
  return { values } as unknown as { values: jest.Mock };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('prd-ai', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.PRD_LLM_MODEL;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    process.env.OPENAI_API_KEY = 'test-openai-key';
    delete process.env.PRD_LLM_MODEL;
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = originalKey;
    process.env.PRD_LLM_MODEL = originalModel;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('constructs generate prompt and parses markdown content', async () => {
    process.env.PRD_LLM_MODEL = 'gpt-test-model';
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        choices: [{ message: { content: '  # PRD\n\n- item  ' } }],
      }),
    );

    const result = await generatePrdMarkdown({
      title: 'Ship metrics',
      description: 'Track goal progress weekly',
    });

    expect(result).toEqual({ markdown: '# PRD\n\n- item', model: 'gpt-test-model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('Produce a crisp PRD in Markdown');
    expect(body.messages[1].content).toContain('Goal title: Ship metrics');
    expect(body.messages[1].content).toContain('Goal description: Track goal progress weekly');
    expect(body.messages[1].content).toContain('- Acceptance Criteria');
  });

  it('constructs update prompt using existing markdown context', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        choices: [{ message: { content: '# Updated PRD' } }],
      }),
    );

    await updatePrdMarkdown({
      title: 'Revise onboarding',
      description: 'Focus on activation',
      currentMarkdown: '# Current\n\nOld scope',
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.messages[0].content).toContain('You update PRDs');
    expect(body.messages[1].content).toContain('Current PRD (markdown):');
    expect(body.messages[1].content).toContain('# Current\n\nOld scope');
  });

  it('uses fallback labels for empty title and description', async () => {
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        choices: [{ message: { content: '# Fallback PRD' } }],
      }),
    );

    await generatePrdMarkdown({ title: '', description: '' });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[1].content).toContain('Goal title: Untitled');
    expect(body.messages[1].content).toContain('Goal description: No description');
  });

  it('returns null when key is missing or API returns invalid payload', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generatePrdMarkdown({ title: 'T', description: 'D' })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.OPENAI_API_KEY = 'test-openai-key';
    fetchMock.mockResolvedValueOnce(createFetchResponse({}, false));
    await expect(generatePrdMarkdown({ title: 'T', description: 'D' })).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(createFetchResponse({ choices: [{ message: { content: '   ' } }] }));
    await expect(generatePrdMarkdown({ title: 'T', description: 'D' })).resolves.toBeNull();
  });

  it('returns null when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(updatePrdMarkdown({ title: 'T', description: 'D', currentMarkdown: '# X' })).resolves.toBeNull();
  });
});

describe('checklist-ai', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = originalKey;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('builds checklist prompt and parses/sanitizes API items', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: ['  first  ', '', 3, 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'],
              }),
            },
          },
        ],
      }),
    );

    const items = await generateChecklistItems('', '');

    expect(items).toHaveLength(7);
    expect(items[0]).toEqual({ id: 'ai-1700000000000-0', text: 'first', checked: false });
    expect(items[6]).toEqual({ id: 'ai-1700000000000-6', text: 'seventh', checked: false });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse((requestInit?.body as string) ?? '{}') as {
      response_format: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('Return valid JSON as {"items": string[]}');
    expect(body.messages[1].content).toContain('Goal title: Untitled');
    expect(body.messages[1].content).toContain('Goal description: No description');
  });

  it('returns empty checklist for missing key, non-ok response, and malformed JSON', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generateChecklistItems('A', 'B')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.OPENAI_API_KEY = 'test-openai-key';
    fetchMock.mockResolvedValueOnce(createFetchResponse({}, false));
    await expect(generateChecklistItems('A', 'B')).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce(
      createFetchResponse({
        choices: [{ message: { content: '{"items":[}' } }],
      }),
    );
    await expect(generateChecklistItems('A', 'B')).resolves.toEqual([]);
  });

  it('parseChecklist and stringifyChecklist normalize malformed inputs', () => {
    expect(parseChecklist('not-json')).toEqual([]);
    expect(parseChecklist(null)).toEqual([]);

    const parsed = parseChecklist(
      JSON.stringify([
        { id: 'x-1', text: '  write tests  ', checked: 1 },
        { text: 'ship' },
        { id: '', text: '   ', checked: true },
        null,
      ]),
    );

    expect(parsed).toEqual([
      { id: 'x-1', text: 'write tests', checked: true },
      { id: 'item-1', text: 'ship', checked: false },
    ]);

    const stringified = stringifyChecklist([
      { id: '', text: '  trim me  ', checked: 0 as unknown as boolean },
      { id: 'abc', text: 'keep', checked: true },
    ]);
    expect(stringified).toBe(
      JSON.stringify([
        { id: 'item-0', text: 'trim me', checked: false },
        { id: 'abc', text: 'keep', checked: true },
      ]),
    );
  });
});

describe('kanbanTrigger', () => {
  const originalFetch = global.fetch;
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;

  async function loadKanbanModule(env: { botToken?: string; chatId?: string }) {
    jest.resetModules();

    if (env.botToken) {
      process.env.TELEGRAM_BOT_TOKEN = env.botToken;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
    if (env.chatId) {
      process.env.TELEGRAM_CHAT_ID = env.chatId;
    } else {
      delete process.env.TELEGRAM_CHAT_ID;
    }

    const insertMock = jest.fn();
    const chatMessagesTable = { table: 'chat_messages' };
    const kanbanTriggersTable = { table: 'kanban_triggers' };

    jest.doMock('@/lib/db', () => ({
      db: {
        insert: insertMock,
      },
    }));
    jest.doMock('@/db/schema', () => ({
      chatMessages: chatMessagesTable,
      kanbanTriggers: kanbanTriggersTable,
    }));

    const module = await import('@/lib/kanbanTrigger');
    return { fireKanbanTrigger: module.fireKanbanTrigger, insertMock, chatMessagesTable, kanbanTriggersTable };
  }

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('logs trigger + chat message and skips Telegram when env is missing', async () => {
    const { fireKanbanTrigger, insertMock, chatMessagesTable, kanbanTriggersTable } = await loadKanbanModule({});
    const triggerInsert = createInsertBuilder();
    const chatInsert = createInsertBuilder();
    insertMock.mockReturnValueOnce(triggerInsert).mockReturnValueOnce(chatInsert);

    await fireKanbanTrigger(1, 2, 'Card A', 'Details', 'created');

    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[0][0]).toBe(kanbanTriggersTable);
    expect(insertMock.mock.calls[1][0]).toBe(chatMessagesTable);
    expect(triggerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 1,
        taskId: 2,
        taskTitle: 'Card A',
        taskDescription: 'Details',
        action: 'created',
      }),
    );
    expect(chatInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 1,
        role: 'assistant',
        content: expect.stringContaining('new card created'),
      }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends Telegram alert when credentials exist and action is moved_to_in_progress', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(createFetchResponse({}, true));

    const { fireKanbanTrigger, insertMock } = await loadKanbanModule({ botToken: 'bot-123', chatId: 'chat-77' });
    const triggerInsert = createInsertBuilder();
    const chatInsert = createInsertBuilder();
    insertMock.mockReturnValueOnce(triggerInsert).mockReturnValueOnce(chatInsert);

    const longDescription = 'x'.repeat(240);
    await fireKanbanTrigger(9, 88, 'Card B', longDescription, 'moved_to_in_progress');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/botbot-123/sendMessage');

    const telegramBody = JSON.parse((fetchMock.mock.calls[0][1]?.body as string) ?? '{}') as {
      chat_id: string;
      text: string;
      parse_mode: string;
    };
    expect(telegramBody.chat_id).toBe('chat-77');
    expect(telegramBody.parse_mode).toBe('Markdown');
    expect(telegramBody.text).toContain('Action: Moved to In Progress');
    expect(telegramBody.text).toContain(`Description: ${'x'.repeat(200)}`);
    expect(telegramBody.text).not.toContain('x'.repeat(201));
    expect(chatInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('moved to In Progress'),
      }),
    );
  });

  it('swallows DB errors and logs failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { fireKanbanTrigger, insertMock } = await loadKanbanModule({});
    insertMock.mockImplementationOnce(() => {
      throw new Error('db failure');
    });

    await expect(fireKanbanTrigger(1, 2, 'Card C', null, 'created')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[kanbanTrigger] Failed to fire trigger:', expect.any(Error));
  });

  it('logs Telegram fetch failures without throwing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockRejectedValueOnce(new Error('telegram down'));

    const { fireKanbanTrigger, insertMock } = await loadKanbanModule({ botToken: 'bot-xyz', chatId: 'chat-xyz' });
    const triggerInsert = createInsertBuilder();
    const chatInsert = createInsertBuilder();
    insertMock.mockReturnValueOnce(triggerInsert).mockReturnValueOnce(chatInsert);

    await expect(fireKanbanTrigger(1, 5, 'Card D', 'desc', 'created')).resolves.toBeUndefined();
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalledWith('[kanbanTrigger] Telegram failed:', expect.any(Error));
  });
});
