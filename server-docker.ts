/**
 * server-docker.ts
 * Plain HTTP server for containerised deployments (Coolify / Docker Compose).
 * SSL is terminated by Traefik (Coolify) or the upstream proxy — never here.
 */
import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import { startHeartbeatWorker } from './src/lib/heartbeat';

const dev  = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const host = process.env.HTTP_BIND   || '0.0.0.0';

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  startHeartbeatWorker();

  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(port, host, () => {
    console.log(`> Mission Control (Docker) ready on http://${host}:${port}`);
  });
});
