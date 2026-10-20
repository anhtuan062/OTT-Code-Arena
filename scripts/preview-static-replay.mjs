import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'static-replay-preview'));
const port = Number(process.env.PORT || 0);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) { response.writeHead(400); response.end('Bad path'); return; }
    let body;
    try { body = await fs.readFile(file); }
    catch (error) {
      if (path.extname(file) || error?.code !== 'ENOENT') throw error;
      body = await fs.readFile(`${file}.html`);
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file).toLowerCase()] || contentTypes[''], 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/`, root })));
const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
