import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { startHeartbeatWorker } from './src/lib/heartbeat';
import { wsManager } from './src/lib/ws-manager';

const dev = process.env.NODE_ENV !== 'production';
// Turbopack is currently unstable on this host (cache/root inference issues).
// Force webpack in development mode for stability.
const app = next({ dev, ...(dev ? { webpack: true } : {}) } as any);
const handle = app.getRequestHandler();
// NOTE: avoid referencing getUpgradeHandler in a type position; Next's dev server
// throws if certain init paths run before prepare().
let handleUpgrade: any = null;

const httpsPort = Number(process.env.PORT_HTTPS) || 3000;
const httpPort  = Number(process.env.PORT_HTTP)  || 3001;

const sslOptions = {
  key:  readFileSync(process.env.SSL_KEY  || '/home/openclaw/projects/mc.key'),
  cert: readFileSync(process.env.SSL_CERT || '/home/openclaw/projects/mc.crt'),
};

/** Attach a WebSocketServer to an existing HTTP/HTTPS server. */
function attachWebSocketServer(server: ReturnType<typeof createHttpServer | typeof createHttpsServer>): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url ?? '', true);

    // Next.js dev HMR websocket(s)
    if (dev && pathname && pathname.startsWith('/_next/')) {
      if (handleUpgrade) {
        handleUpgrade(req as any, socket as any, head as any);
      } else {
        socket.destroy();
      }
      return;
    }

    // Only handle our chat WS endpoint
    if (pathname !== '/api/chat/ws') {
      socket.destroy();
      return;
    }

    const token = Array.isArray(query.token) ? query.token[0] : query.token;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const tenantId = wsManager.validateToken(token);
    if (!tenantId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log(`[ws] client connected tenant=${tenantId} total=${wsManager.clientCount + 1}`);
      wsManager.addClient(tenantId, ws);
      // Ping every 10s — keeps connection alive through Tailscale and CF proxies
      const ping = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.ping();
        else clearInterval(ping);
      }, 10_000);
      ws.on('close', (code, reason) => {
        console.log(`[ws] client disconnected tenant=${tenantId} code=${code} reason=${reason} remaining=${wsManager.clientCount}`);
        clearInterval(ping);
      });
      ws.on('error', (err) => console.error(`[ws] error tenant=${tenantId}:`, err.message));
    });
  });
}

app.prepare().then(() => {
  handleUpgrade = app.getUpgradeHandler();
  startHeartbeatWorker();

  const handler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  // HTTPS for Tailscale / direct access
  const httpsServer = createHttpsServer(sslOptions, handler);
  attachWebSocketServer(httpsServer);
  httpsServer.listen(httpsPort, () => {
    console.log(`> Mission Control ready on https://ocprd-sgp1-01.***REDACTED_HOST***:${httpsPort}`);
  });

  // HTTP for Cloudflare Tunnel or local dev
  const httpHost = process.env.HTTP_BIND || '127.0.0.1';
  const httpServer = createHttpServer(handler);
  attachWebSocketServer(httpServer);
  httpServer.listen(httpPort, httpHost, () => {
    console.log(`> Mission Control HTTP on http://${httpHost}:${httpPort}`);
  });
});
