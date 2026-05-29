import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'demo-output');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = resolve(DIR, '.' + p);
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(4599, () => console.log('demo server on http://localhost:4599'));
