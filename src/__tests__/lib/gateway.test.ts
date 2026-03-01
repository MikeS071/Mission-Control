import { createHash } from 'node:crypto';

const mockExecFile = jest.fn();
const mockExistsSync = jest.fn();

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    const ws = MockWebSocket.instances.at(-1);
    if (!ws) throw new Error('Expected a websocket instance');
    return ws;
  }

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  sendError: Error | null = null;
  private handlers: Record<string, Array<(value?: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  on(event: string, handler: (value?: unknown) => void): void {
    this.handlers[event] ??= [];
    this.handlers[event].push(handler);
  }

  send(data: string, cb?: (err?: Error) => void): void {
    this.sent.push(data);
    if (cb) cb(this.sendError ?? undefined);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  emit(event: string, value?: unknown): void {
    for (const handler of this.handlers[event] ?? []) {
      handler(value);
    }
  }
}

jest.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

jest.mock('node:fs', () => ({
  __esModule: true,
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync,
}));

jest.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

import { checkGatewayHealth, hashToken } from '@/lib/gateway';
import { openclawGatewayCall } from '@/lib/openclaw-gateway-cli';
import { wsManager } from '@/lib/ws-manager';
import { OpenClawWsClient } from '@/lib/openclaw-ws-client';

function mockExecFileResolve(stdout: string): void {
  mockExecFile.mockImplementation(
    (_bin: string, _args: string[], _opts: unknown, cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: '' });
    },
  );
}

function parseSentFrame(ws: MockWebSocket, idx: number): Record<string, unknown> {
  return JSON.parse(ws.sent[idx]) as Record<string, unknown>;
}

function completeConnectHandshake(ws: MockWebSocket, ok = true): void {
  ws.readyState = MockWebSocket.OPEN;
  ws.emit('open');
  const connectReq = parseSentFrame(ws, 0);
  ws.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'res',
        id: connectReq.id,
        ok,
        payload: ok ? { connected: true } : undefined,
        error: ok ? undefined : { code: 'rejected' },
      }),
    ),
  );
}

describe('gateway/websocket libraries', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    MockWebSocket.reset();
    mockExistsSync.mockReturnValue(false);

    delete process.env.OPENCLAW_BIN;
    delete process.env.MC_WS_TOKEN_SECRET;
    delete process.env.API_SECRET;

    Object.defineProperty(global, 'fetch', {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(global, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
  });

  it('hashToken normalizes and hashes non-empty tokens', () => {
    expect(hashToken('   ')).toBeNull();

    const expected = createHash('sha256').update('abc123').digest('hex');
    expect(hashToken('  abc123  ')).toBe(expected);
  });

  it('checkGatewayHealth returns ok with parsed JSON info', async () => {
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 'healthy' }),
    } as unknown as Response);

    await expect(checkGatewayHealth('  https://gw.local/health  ', '  secret  ')).resolves.toEqual({
      status: 'ok',
      info: { status: 'healthy' },
    });

    expect(mockFetch).toHaveBeenCalledWith('https://gw.local/health', {
      method: 'GET',
      headers: { Authorization: 'Bearer secret' },
      cache: 'no-store',
    });
  });

  it('checkGatewayHealth returns error for non-ok response and null JSON parse', async () => {
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockRejectedValue(new Error('bad json')),
    } as unknown as Response);

    await expect(checkGatewayHealth('https://gw.local/health')).resolves.toEqual({
      status: 'error',
      info: null,
    });
  });

  it('checkGatewayHealth returns error when fetch throws', async () => {
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(checkGatewayHealth('https://gw.local/health')).resolves.toEqual({
      status: 'error',
      info: null,
    });
  });

  it('openclawGatewayCall formats command args and parses JSON output', async () => {
    process.env.OPENCLAW_BIN = '/custom/openclaw';
    mockExecFileResolve('{"ok":true,"value":42}');

    await expect(openclawGatewayCall('jobs.list', { page: 1 }, { timeoutMs: 1234, maxBufferBytes: 2048 })).resolves.toEqual({
      ok: true,
      value: 42,
    });

    expect(mockExecFile).toHaveBeenCalledWith(
      '/custom/openclaw',
      ['gateway', 'call', 'jobs.list', '--params', '{"page":1}', '--json'],
      expect.objectContaining({ timeout: 1234, maxBuffer: 2048, env: process.env }),
      expect.any(Function),
    );
  });

  it('openclawGatewayCall parses trailing JSON and wraps execution failures', async () => {
    mockExecFileResolve('noise before\n{"status":"ok"}');
    await expect(openclawGatewayCall('status.get', undefined)).resolves.toEqual({ status: 'ok' });

    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: (err: Error) => void) => cb(new Error('spawn failed')),
    );

    await expect(openclawGatewayCall('status.get', undefined)).rejects.toThrow(
      'openclaw gateway call failed (status.get): spawn failed',
    );
  });

  it('wsManager creates/verifies short-lived tokens and rejects expired tokens', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));

    process.env.MC_WS_TOKEN_SECRET = 'test-secret';

    const token = wsManager.createToken(77);
    expect(wsManager.validateToken(token)).toBe(77);

    jest.advanceTimersByTime(30_001);
    expect(wsManager.validateToken(token)).toBeNull();
  });

  it('wsManager broadcasts to open clients and drops unhealthy sockets', () => {
    const tenantId = 501;
    const openWs = new MockWebSocket('ws://mock');
    openWs.readyState = MockWebSocket.OPEN;
    const deadWs = new MockWebSocket('ws://mock-dead');
    deadWs.readyState = MockWebSocket.CLOSED;

    wsManager.addClient(tenantId, openWs as unknown as never);
    wsManager.addClient(tenantId, deadWs as unknown as never);

    wsManager.broadcast(tenantId, {
      id: 1,
      role: 'assistant',
      content: 'hello',
      createdAt: '2026-02-01T00:00:00.000Z',
      threadId: null,
    });

    expect(openWs.sent).toHaveLength(1);
    expect(JSON.parse(openWs.sent[0])).toMatchObject({ role: 'assistant', content: 'hello' });

    wsManager.removeClient(tenantId, openWs as unknown as never);
    expect(wsManager.clientCount).toBe(0);
  });

  it('OpenClawWsClient handshakes, sends heartbeat call, and receives response', async () => {
    const client = new OpenClawWsClient({ url: 'ws://gateway.local', token: 'ws-token', requestTimeoutMs: 500 });

    const connectPromise = client.ensureConnected();
    const ws = MockWebSocket.latest();
    completeConnectHandshake(ws);
    await connectPromise;

    const connectFrame = parseSentFrame(ws, 0);
    expect(connectFrame.method).toBe('connect');
    expect((connectFrame.params as Record<string, unknown>).auth).toEqual({ token: 'ws-token' });

    const heartbeatPromise = client.call('heartbeat', { ping: 1 });
    await Promise.resolve();
    const heartbeatReq = parseSentFrame(ws, 1);
    expect(heartbeatReq.method).toBe('heartbeat');

    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'res', id: heartbeatReq.id, ok: true, payload: { pong: 1 } })),
    );

    await expect(heartbeatPromise).resolves.toEqual({ pong: 1 });
  });

  it('OpenClawWsClient reconnects after disconnect and rejects inflight call', async () => {
    const client = new OpenClawWsClient({ url: 'ws://gateway.local' });

    const connectPromise = client.ensureConnected();
    const ws1 = MockWebSocket.latest();
    completeConnectHandshake(ws1);
    await connectPromise;

    const inflight = client.call('jobs.run', { id: 9 });
    await Promise.resolve();
    ws1.emit('close');
    await expect(inflight).rejects.toThrow('OpenClaw WS disconnected');

    const reconnectPromise = client.ensureConnected();
    expect(MockWebSocket.instances).toHaveLength(2);
    const ws2 = MockWebSocket.latest();
    completeConnectHandshake(ws2);
    await expect(reconnectPromise).resolves.toBeUndefined();
  });

  it('OpenClawWsClient enforces connect timeout', async () => {
    jest.useFakeTimers();

    const client = new OpenClawWsClient({ url: 'ws://gateway.local', connectTimeoutMs: 50 });
    const connectPromise = client.ensureConnected();

    jest.advanceTimersByTime(51);
    await Promise.resolve();

    await expect(connectPromise).rejects.toThrow('OpenClaw WS connect timeout');
  });

  it('OpenClawWsClient enforces request timeout', async () => {
    jest.useFakeTimers();

    const client = new OpenClawWsClient({ url: 'ws://gateway.local', requestTimeoutMs: 10 });

    const connectPromise = client.ensureConnected();
    const ws = MockWebSocket.latest();
    completeConnectHandshake(ws);
    await connectPromise;

    const callPromise = client.call('status.get', {});
    await Promise.resolve();
    jest.advanceTimersByTime(11);
    await Promise.resolve();

    await expect(callPromise).rejects.toThrow('OpenClaw WS request timeout (status.get)');
  });
});
