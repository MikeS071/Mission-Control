/**
 * WsManager — in-process WebSocket broadcast hub
 *
 * Maintains a registry of live WS connections per tenantId and exposes:
 *   - broadcast(tenantId, payload)  — push JSON to all connected clients
 *   - createToken(tenantId)         — issue a 30-second one-use WS auth token
 *   - validateToken(token)          — consume a token → tenantId | null
 *
 * Exported as a module-level singleton so both server.ts and API routes
 * share the same instance within the same Node.js process.
 */

import { WebSocket } from 'ws';
import { randomBytes } from 'crypto';

interface PendingToken {
  tenantId: number;
  expiresAt: number;
}

export interface WsChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

class WsManager {
  /** tenantId → set of live connections */
  private connections = new Map<number, Set<WebSocket>>();

  /** one-time auth tokens → { tenantId, expiresAt } */
  private tokens = new Map<string, PendingToken>();

  /** Token TTL in ms */
  private readonly TOKEN_TTL = 30_000;

  // ── Token management ─────────────────────────────────────────────────────

  createToken(tenantId: number): string {
    this.pruneExpiredTokens();
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, { tenantId, expiresAt: Date.now() + this.TOKEN_TTL });
    return token;
  }

  /**
   * Validate and consume a token. Returns tenantId on success, null otherwise.
   * One-use: token is removed immediately to prevent replay.
   */
  validateToken(token: string): number | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    this.tokens.delete(token); // one-use
    if (Date.now() > entry.expiresAt) return null;
    return entry.tenantId;
  }

  private pruneExpiredTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens.entries()) {
      if (now > entry.expiresAt) this.tokens.delete(token);
    }
  }

  // ── Connection management ─────────────────────────────────────────────────

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

  // ── Broadcast ─────────────────────────────────────────────────────────────

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

// Singleton — shared across server.ts and all API routes in this process
export const wsManager = new WsManager();
