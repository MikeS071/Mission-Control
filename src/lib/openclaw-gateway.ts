export interface OpenClawChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function openclawChatCompletion(params: {
  sessionKey: string;
  messages: OpenClawChatMessage[];
  maxTokens?: number;
}): Promise<string> {
  const url = process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789';
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) throw new Error('OPENCLAW_GATEWAY_TOKEN missing');

  const res = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-openclaw-agent-id': 'main',
      'x-openclaw-session-key': params.sessionKey,
    },
    body: JSON.stringify({
      model: 'openclaw:main',
      messages: params.messages,
      max_tokens: params.maxTokens ?? 1024,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenClaw gateway error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as any;
  // OpenAI-style shape: choices[0].message.content
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenClaw gateway response missing choices[0].message.content');
  }
  return content;
}
