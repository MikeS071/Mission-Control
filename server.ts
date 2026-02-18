import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import next from 'next';
import { parse } from 'url';
import { startHeartbeatWorker } from './src/lib/heartbeat';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const httpsPort = Number(process.env.PORT_HTTPS) || 3000;
const httpPort  = Number(process.env.PORT_HTTP)  || 3001;

const sslOptions = {
  key:  readFileSync(process.env.SSL_KEY  || '/home/openclaw/projects/mc.key'),
  cert: readFileSync(process.env.SSL_CERT || '/home/openclaw/projects/mc.crt'),
};

app.prepare().then(() => {
  startHeartbeatWorker();

  const handler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  // HTTPS for Tailscale / direct access
  createHttpsServer(sslOptions, handler).listen(httpsPort, () => {
    console.log(`> Mission Control ready on https://ocprd-sgp1-01.tailb9b7d3.ts.net:${httpsPort}`);
  });

  // HTTP for Cloudflare Tunnel or local dev
  createHttpServer(handler).listen(httpPort, '127.0.0.1', () => {
    console.log(`> Mission Control HTTP on http://127.0.0.1:${httpPort}`);
  });
});
