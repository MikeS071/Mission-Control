const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export type PrdLLMResult = {
  markdown: string;
  model: string;
};

function buildSystemPrompt(mode: 'generate' | 'update'): string {
  if (mode === 'update') {
    return 'You update PRDs. Take the existing PRD as context and rewrite it so it matches the new goal title/description. Preserve useful details but fix inconsistencies. Output ONLY the final Markdown.';
  }
  return 'You are a product manager and engineering lead. Produce a crisp PRD in Markdown. Be specific, actionable, and avoid fluff. Keep it short.';
}

function buildUserPrompt(params: {
  title: string;
  description: string;
  currentMarkdown?: string;
  mode: 'generate' | 'update';
}): string {
  const lines: string[] = [];
  lines.push(`Goal title: ${params.title || 'Untitled'}`);
  lines.push(`Goal description: ${params.description || 'No description'}`);
  lines.push('');

  if (params.mode === 'update') {
    lines.push('Current PRD (markdown):');
    lines.push('---');
    lines.push(params.currentMarkdown || '(empty)');
    lines.push('---');
    lines.push('');
  }

  lines.push('Write a PRD in Markdown with sections:');
  lines.push('- Problem');
  lines.push('- Goals');
  lines.push('- Non-Goals');
  lines.push('- User Stories');
  lines.push('- Acceptance Criteria');
  lines.push('- Open Questions');

  return lines.join('\n');
}

async function callOpenAI(params: {
  mode: 'generate' | 'update';
  title: string;
  description: string;
  currentMarkdown?: string;
}): Promise<PrdLLMResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.PRD_LLM_MODEL || 'gpt-4o-mini';

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildSystemPrompt(params.mode) },
        { role: 'user', content: buildUserPrompt({ ...params, mode: params.mode }) },
      ],
    }),
  });

  if (!res.ok) return null;
  const payload = (await res.json()) as OpenAIChatResponse;
  const markdown = payload.choices?.[0]?.message?.content?.trim();
  if (!markdown) return null;

  return { markdown, model };
}

export async function generatePrdMarkdown(params: { title: string; description: string }): Promise<PrdLLMResult | null> {
  try {
    return await callOpenAI({ mode: 'generate', title: params.title, description: params.description });
  } catch {
    return null;
  }
}

export async function updatePrdMarkdown(params: {
  title: string;
  description: string;
  currentMarkdown: string;
}): Promise<PrdLLMResult | null> {
  try {
    return await callOpenAI({
      mode: 'update',
      title: params.title,
      description: params.description,
      currentMarkdown: params.currentMarkdown,
    });
  } catch {
    return null;
  }
}
