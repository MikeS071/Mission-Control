import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { startHeartbeatWorker } from './src/lib/heartbeat';
import { wsManager } from './src/lib/ws-manager';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

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
      wsManager.addClient(tenantId, ws);
      // Send a ping every 25s to keep connections alive through proxies
      const ping = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.ping();
        else clearInterval(ping);
      }, 25_000);
      ws.on('close', () => clearInterval(ping));
    });
  });
}

app.prepare().then(() => {
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
