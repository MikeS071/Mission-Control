type ChecklistItem = { id: string; text: string; checked: boolean };

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function safeJsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .slice(0, 7);
}

export async function generateChecklistItems(title: string, description: string): Promise<ChecklistItem[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You generate concise, actionable checklist items for software goals. Return valid JSON as {"items": string[]}. 3 to 7 items only.',
          },
          {
            role: 'user',
            content: `Goal title: ${title || 'Untitled'}\nGoal description: ${description || 'No description'}\nReturn only JSON.`,
          },
        ],
      }),
    });

    if (!response.ok) return [];
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = JSON.parse(content) as { items?: unknown };
    const items = safeJsonArray(parsed.items);

    return items.map((text, index) => ({
      id: `ai-${Date.now()}-${index}`,
      text,
      checked: false,
    }));
  } catch {
    return [];
  }
}

export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as { id?: unknown; text?: unknown; checked?: unknown };
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        if (!text) return null;
        return {
          id: typeof entry.id === 'string' ? entry.id : `item-${index}`,
          text,
          checked: Boolean(entry.checked),
        };
      })
      .filter((item): item is ChecklistItem => Boolean(item));
  } catch {
    return [];
  }
}

export function stringifyChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(
    items.map((item, index) => ({
      id: item.id || `item-${index}`,
      text: item.text.trim(),
      checked: Boolean(item.checked),
    })),
  );
}
