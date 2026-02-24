import { WebSocket } from 'ws';

type ReqFrame = {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
};

type ResFrame = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: unknown;
};

type EventFrame = {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
};

type Frame = ReqFrame | ResFrame | EventFrame;

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timeout: NodeJS.Timeout;
};

export type OpenClawWsClientOptions = {
  /** e.g. ws://127.0.0.1:18789 */
  url: string;
  token?: string;
  clientId?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  clientPlatform?: string;
  clientMode?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object';
}

function frameFromUnknown(x: unknown): Frame | null {
  if (!isObject(x)) return null;
  const type = x.type;
  if (type === 'req' || type === 'res' || type === 'event') return x as Frame;
  return null;
}

let globalReqCounter = 0;
function nextId(prefix: string): string {
  globalReqCounter = (globalReqCounter + 1) % 1_000_000_000;
  return `${prefix}-${Date.now()}-${globalReqCounter}`;
}

export class OpenClawWsClient {
  private readonly url: string;
  private readonly token?: string;

  private ws: WebSocket | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;

  private pending = new Map<string, Pending>();

  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;

  private readonly clientId: string;
  private readonly clientDisplayName: string;
  private readonly clientVersion: string;
  private readonly clientPlatform: string;
  private readonly clientMode: string;

  constructor(opts: OpenClawWsClientOptions) {
    this.url = opts.url;
    this.token = opts.token;

    this.connectTimeoutMs = opts.connectTimeoutMs ?? 5_000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 15_000;

    // IMPORTANT: client.id and client.mode are schema-enforced enumerations by the gateway.
    // Use a known id/mode so connect isn't rejected.
    this.clientId = opts.clientId ?? 'gateway-client';
    this.clientDisplayName = opts.clientDisplayName ?? 'Mission Control';
    this.clientVersion = opts.clientVersion ?? '0.1.0';
    this.clientPlatform = opts.clientPlatform ?? `node ${process.version}`;
    this.clientMode = opts.clientMode ?? 'backend';
  }

  /**
   * Ensure the underlying WS is connected and handshake (connect → hello-ok) has completed.
   */
  async ensureConnected(): Promise<void> {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.connectInternal().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private connectInternal(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.connected = false;

      let settled = false;

      const connectId = nextId('connect');

      const connectTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error('OpenClaw WS connect timeout'));
      }, this.connectTimeoutMs);

      const cleanup = () => {
        clearTimeout(connectTimeout);
      };

      ws.on('open', () => {
        const frame: ReqFrame = {
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            // Gateway protocol is v3 in current OpenClaw.
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: this.clientId,
              displayName: this.clientDisplayName,
              version: this.clientVersion,
              platform: this.clientPlatform,
              mode: this.clientMode,
              instanceId: 'mc',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: this.token ? { token: this.token } : undefined,
            locale: 'en-US',
            userAgent: `mission-control/${this.clientVersion}`,
          },
        };
        ws.send(JSON.stringify(frame));
      });

      ws.on('message', (buf) => {
        const raw = safeJsonParse(buf.toString());
        const frame = frameFromUnknown(raw);
        if (!frame) return;

        // Connect handshake
        if (frame.type === 'res' && frame.id === connectId) {
          cleanup();
          if (settled) return;
          settled = true;

          if (!frame.ok) {
            reject(new Error(`OpenClaw WS connect rejected: ${JSON.stringify(frame.error ?? {})}`));
            return;
          }
          this.connected = true;
          resolve();
          return;
        }

        // Normal responses
        if (frame.type === 'res') {
          const p = this.pending.get(frame.id);
          if (!p) return;
          this.pending.delete(frame.id);
          clearTimeout(p.timeout);
          if (!frame.ok) {
            p.reject(new Error(`OpenClaw WS error: ${JSON.stringify(frame.error ?? {})}`));
            return;
          }
          p.resolve(frame.payload);
          return;
        }

        // Events are ignored in MVP.
      });

      const onCloseOrError = (err?: Error) => {
        cleanup();

        const wasSettled = settled;
        if (!settled) settled = true;

        this.connected = false;
        this.ws = null;

        // Reject any inflight requests
        for (const [id, p] of this.pending.entries()) {
          this.pending.delete(id);
          clearTimeout(p.timeout);
          p.reject(new Error('OpenClaw WS disconnected'));
        }

        // If we closed before handshake completed, reject the connect promise.
        if (!wasSettled) {
          reject(err ?? new Error('OpenClaw WS closed during handshake'));
        }
      };

      ws.on('close', () => onCloseOrError());
      ws.on('error', (e) => onCloseOrError(e instanceof Error ? e : new Error('OpenClaw WS error')));
    });
  }

  async call(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    await this.ensureConnected();

    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('OpenClaw WS not connected');
    }

    const id = nextId(method.replace(/[^a-zA-Z0-9_-]/g, '_'));

    const t = setTimeout(() => {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      p.reject(new Error(`OpenClaw WS request timeout (${method})`));
    }, timeoutMs ?? this.requestTimeoutMs);

    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, timeout: t });
    });

    const frame: ReqFrame = {
      type: 'req',
      id,
      method,
      params,
    };
    ws.send(JSON.stringify(frame));

    return p;
  }
}

function toWsUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  if (trimmed.startsWith('https://')) return 'wss://' + trimmed.slice('https://'.length);
  if (trimmed.startsWith('http://')) return 'ws://' + trimmed.slice('http://'.length);
  // Assume host:port
  return `ws://${trimmed}`;
}

// Process-global singleton for route handlers
const globalKey = '__OPENCLAW_WS_CLIENT__';
const g = globalThis as any;

export function getOpenClawWsClient(): OpenClawWsClient {
  if (g[globalKey]) return g[globalKey] as OpenClawWsClient;

  const base = process.env.OPENCLAW_GATEWAY_WS_URL ?? process.env.OPENCLAW_GATEWAY_URL ?? 'http://127.0.0.1:18789';
  const url = toWsUrl(base);
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;

  // Token is required by default even on loopback; we keep it server-side.
  g[globalKey] = new OpenClawWsClient({ url, token });
  return g[globalKey] as OpenClawWsClient;
}
