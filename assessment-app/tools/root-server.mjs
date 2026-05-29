import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the pro-leo-site root so the real index.html can be previewed locally.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };

createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let file = resolve(ROOT, '.' + p);
  if (!existsSync(file) || statSync(file).isDirectory()) file = resolve(ROOT, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(4601, () => console.log('root server on http://localhost:4601'));
