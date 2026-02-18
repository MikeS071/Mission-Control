import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import next from 'next';
import { parse } from 'url';
import { startHeartbeatWorker } from './src/lib/heartbeat';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const sslOptions = {
  key: readFileSync(process.env.SSL_KEY || '/home/openclaw/projects/mc.key'),
  cert: readFileSync(process.env.SSL_CERT || '/home/openclaw/projects/mc.crt'),
};

app.prepare().then(() => {
  startHeartbeatWorker();

  const handler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  // HTTPS for Tailscale access
  createHttpsServer(sslOptions, handler).listen(3000, () => {
    console.log('> Mission Control ready on https://ocprd-sgp1-01.tailb9b7d3.ts.net:3000');
  });

  // HTTP for Cloudflare Tunnel (no TLS needed — Cloudflare handles it)
  createHttpServer(handler).listen(3001, '127.0.0.1', () => {
    console.log('> Mission Control HTTP (Cloudflare tunnel) on http://127.0.0.1:3001');
  });
});
