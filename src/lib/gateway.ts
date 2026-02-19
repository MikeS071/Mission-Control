import { createHash } from 'crypto';

type GatewayCheckResult = {
  status: 'ok' | 'error';
  info: unknown;
};

export function hashToken(token?: string): string | null {
  const normalized = token?.trim();
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
}

export async function checkGatewayHealth(url: string, token?: string): Promise<GatewayCheckResult> {
  const headers: HeadersInit = {};
  const normalizedToken = token?.trim();
  if (normalizedToken) headers.Authorization = `Bearer ${normalizedToken}`;

  try {
    const response = await fetch(url.trim(), { method: 'GET', headers, cache: 'no-store' });
    let info: unknown = null;
    try {
      info = await response.json();
    } catch {
      info = null;
    }
    return { status: response.ok ? 'ok' : 'error', info };
  } catch {
    return { status: 'error', info: null };
  }
}
