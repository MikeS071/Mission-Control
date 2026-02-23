/**
 * WsManager — in-process WebSocket broadcast hub
 *
 * Maintains a registry of live WS connections per tenantId and exposes:
 *   - broadcast(tenantId, payload)  — push JSON to all connected clients
 *   - createToken(tenantId)         — issue a short-lived WS auth token
 *   - validateToken(token)          — validate token → tenantId | null
 *
 * IMPORTANT:
 * Next.js route handlers and server.ts can be evaluated in different module
 * graphs/bundles (even in the same Node.js process). So:
 *   - connection registry must be global (for broadcasting)
 *   - token validation must be stateless (no shared in-memory token map)
 */

import { WebSocket } from 'ws';
import { createHmac } from 'crypto';

export interface WsChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

type TokenPayload = {
  tid: number; // tenantId
  exp: number; // unix millis
};

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

class WsManager {
  /** tenantId → set of live connections */
  private connections = new Map<number, Set<WebSocket>>();

  /** Token TTL in ms */
  private readonly TOKEN_TTL = 30_000;

  private get secret(): string {
    // Prefer an explicit secret; fall back to API_SECRET so local dev works.
    return (
      process.env.MC_WS_TOKEN_SECRET ??
      process.env.API_SECRET ??
      ''
    );
  }

  // ── Token management (stateless) ─────────────────────────────────────────

  createToken(tenantId: number): string {
    const secret = this.secret;
    if (!secret) {
      throw new Error('MC_WS_TOKEN_SECRET/API_SECRET not configured');
    }

    const payload: TokenPayload = { tid: tenantId, exp: Date.now() + this.TOKEN_TTL };
    const p = b64urlJson(payload);
    const sig = b64url(createHmac('sha256', secret).update(p).digest());
    return `${p}.${sig}`;
  }

  validateToken(token: string): number | null {
    const secret = this.secret;
    if (!secret) return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [p, sig] = parts;

    const expected = b64url(createHmac('sha256', secret).update(p).digest());
    // constant-time compare
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return null;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff !== 0) return null;

    try {
      const payload = JSON.parse(b64urlDecode(p).toString('utf8')) as TokenPayload;
      if (!payload?.tid || !payload?.exp) return null;
      if (Date.now() > payload.exp) return null;
      return payload.tid;
    } catch {
      return null;
    }
  }

  // ── Connection management ────────────────────────────────────────────────

  addClient(tenantId: number, ws: WebSocket): void {
    if (!this.connections.has(tenantId)) {
      this.connections.set(tenantId, new Set());
    }
    this.connections.get(tenantId)!.add(ws);

    ws.on('close', () => this.removeClient(tenantId, ws));
    ws.on('error', () => this.removeClient(tenantId, ws));
  }

  removeClient(tenantId: number, ws: WebSocket): void {
    const set = this.connections.get(tenantId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.connections.delete(tenantId);
  }

  get clientCount(): number {
    let count = 0;
    for (const set of this.connections.values()) count += set.size;
    return count;
  }

  // ── Broadcast ────────────────────────────────────────────────────────────

  broadcast(tenantId: number, message: WsChatMessage): void {
    const clients = this.connections.get(tenantId);
    if (!clients || clients.size === 0) return;

    const payload = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload, (err) => {
          if (err) this.removeClient(tenantId, ws);
        });
      } else {
        this.removeClient(tenantId, ws);
      }
    }
  }
}

// Global singleton for connection registry (broadcasts)
const globalKey = '__MISSION_CONTROL_WS_MANAGER__';
const g = globalThis as any;
export const wsManager: WsManager = g[globalKey] ?? (g[globalKey] = new WsManager());
