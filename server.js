import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path !== '/' && !path.startsWith('/src/')) { res.writeHead(404); res.end(); return; }
    const file = resolve(root, path === '/' ? 'index.html' : `.${path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Invalid path');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Nicht gefunden'); }
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Zuhause: http://localhost:' + (process.env.PORT || 3000)));
