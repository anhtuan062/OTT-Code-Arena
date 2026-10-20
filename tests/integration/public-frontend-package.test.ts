import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPublicFrontend } from '../../scripts/build-public.js';

const roots: string[] = [];

function serve(root: string) {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/api/auth/me') {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) {
      response.writeHead(400);
      response.end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.writeHead(200);
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as import('node:net').AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('standalone public frontend package', () => {
  it('contains only the frontend assets and preserves fragment paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-frontend-'));
    roots.push(root);
    const output = await buildPublicFrontend({ outputDir: path.join(root, 'public') });
    const required = [
      'index.html', 'app.js', 'style.css', 'favicon.svg', 'js/page-loader.js',
      'styles/views/replay.css', 'styles/components/app-shell.css', 'views/pages/auth.html',
      'views/pages/dashboard.html', 'views/pages/replay.html',
    ];
    for (const relative of required) await expect(fs.stat(path.join(output, relative))).resolves.toBeTruthy();
    const index = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    expect(index).toContain('/js/page-loader.js');
    expect(index).toContain('/views/pages/tournament-detail.html');
    expect(index).toContain('href="styles/views/replay.css"');
    expect(index).toContain('href="favicon.svg"');
    await expect(fs.stat(path.join(output, 'server'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(output, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(output, 'arena.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(output, 'js', 'api.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(output, 'functions'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(process.cwd(), 'functions', 'api', '[[path]].ts'))).resolves.toBeTruthy();
  });

  it('starts through an isolated HTTP server and serves fragments without backend access', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-frontend-'));
    roots.push(root);
    const output = await buildPublicFrontend({ outputDir: path.join(root, 'public') });
    const preview = await serve(output);
    try {
      const index = await fetch(`${preview.url}/`);
      const loader = await fetch(`${preview.url}/js/page-loader.js`);
      const fragment = await fetch(`${preview.url}/views/pages/replay.html`);
      expect(index.status).toBe(200);
      expect(loader.status).toBe(200);
      expect(fragment.status).toBe(200);
      expect(await loader.text()).toContain('loadPageFragments');
      expect(await fragment.text()).toContain('id="replay-view"');
      expect((await fetch(`${preview.url}/api/auth/me`)).status).toBe(401);
    } finally {
      await new Promise<void>(resolve => preview.server.close(() => resolve()));
    }
  });
});
