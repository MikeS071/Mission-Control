import { createServer } from 'https';
import { readFileSync } from 'fs';
import next from 'next';
import { parse } from 'url';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const options = {
  key: readFileSync(process.env.SSL_KEY || '/home/openclaw/projects/mc.key'),
  cert: readFileSync(process.env.SSL_CERT || '/home/openclaw/projects/mc.crt'),
};

app.prepare().then(() => {
  createServer(options, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(3000, () => {
    console.log('> Mission Control ready on https://ocprd-sgp1-01.tailb9b7d3.ts.net:3000');
  });
});
