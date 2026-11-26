// Server minimo per guardare l'app sul Mac prima di pubblicarla.
// Le notifiche NON funzionano qui: servono HTTPS e l'icona sulla schermata Home.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.join(fileURLToPath(new URL('..', import.meta.url)), 'docs');
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const pulito = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(radice, pulito === '/' ? 'index.html' : pulito);
  if (!file.startsWith(radice)) { res.writeHead(403).end('no'); return; }
  try {
    const b = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(b);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('non trovato: ' + pulito); }
}).listen(4173, () => console.log('\n  Anteprima su http://localhost:4173\n'));
