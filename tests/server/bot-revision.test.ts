import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { getStrategySdkIdentity } from '../../bot-executor/strategy-sdk.js';

describe('Bot source revisions', () => {
  const password = 'correct horse battery staple';
  let dir: string;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;
  let botId: string;
  let userId: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-source-'));
    await initServer(dir);
    agent = request.agent(appExport);
    const auth = await agent.post('/api/auth/register').send({ username: `source${Date.now()}`, password });
    csrf = auth.body.csrfToken;
    userId = auth.body.user.id;
    const bot = await agent.post('/api/bots').set('x-csrf-token', csrf).send({ name: 'Source Bot', command: 'node', args: ['bot.js'] });
    expect(bot.status).toBe(201);
    botId = bot.body.id;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  function mockGitHub(source: string, sha = 'a'.repeat(40), filename = 'main.cpp') {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/octo/bot/commits/')) return new Response(JSON.stringify({ sha }), { status: 200 });
      if (url.includes('/contents/')) {
        if (url.includes(`/contents/${filename}?ref=${sha}`)) return new Response(JSON.stringify({
          type: 'file', name: filename, path: filename, encoding: 'base64', content: Buffer.from(source, 'utf8').toString('base64'),
        }), { status: 200 });
        return new Response('', { status: 404 });
      }
      if (url.includes('/repos/octo/bot')) return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
      return new Response('', { status: 404 });
    }));
  }

  it('creates, reads, lists, and selects immutable source revisions', async () => {
    const first = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', source: 'int main() { return 1; }\n', label: 'first' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ botId, runtimeId: 'cpp', selected: false });

    const second = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', source: 'int main() { return 2; }\n', label: 'second' });
    expect(second.status).toBe(201);
    expect(second.body.revisionId).not.toBe(first.body.revisionId);

    const list = await agent.get(`/api/bots/${botId}/revisions`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.every((revision: { source?: unknown }) => revision.source === undefined)).toBe(true);

    const read = await agent.get(`/api/bots/${botId}/revisions/${first.body.revisionId}`);
    expect(read.status).toBe(200);
    expect(read.body.source).toBe('int main() { return 1; }\n');
    const selected = await agent.post(`/api/bots/${botId}/revisions/${first.body.revisionId}/select`).set('x-csrf-token', csrf).send({});
    expect(selected.status).toBe(200);
    expect((await agent.get(`/api/bots/${botId}/revisions`)).body.find((item: { revisionId: string }) => item.revisionId === first.body.revisionId).selected).toBe(true);

    const bot = await agent.get(`/api/bots/${botId}`);
    expect(bot.body.currentRevisionId).toBe(first.body.revisionId);
    expect(bot.body.selectedRevision).toMatchObject({ revisionId: first.body.revisionId, runtimeId: 'cpp', executionMode: 'raw', label: 'first' });
    expect(bot.body.selectedRevision).not.toHaveProperty('source');
    expect((await agent.get('/api/bots')).body.find((item: { id: string }) => item.id === botId).selectedRevision).toMatchObject({ revisionId: first.body.revisionId, runtimeId: 'cpp' });
    const after = await agent.get(`/api/bots/${botId}/revisions/${first.body.revisionId}`);
    expect(after.body.source).toBe('int main() { return 1; }\n');
  });

  it('requires CSRF, rejects invalid runtime and oversized source', async () => {
    expect((await agent.post(`/api/bots/${botId}/revisions`).send({ runtimeId: 'python', source: 'x' })).status).toBe(403);
    expect((await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ runtimeId: 'python', source: 'x' })).status).toBe(400);
    expect((await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ runtimeId: 'cpp', source: 'x'.repeat(70 * 1024) })).status).toBe(413);
    expect((await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ runtimeId: 'nodejs', source: 'console.log(1);' })).status).toBe(400);
  });

  it('stores client-validated GitHub provenance without fetching the supplied URL', async () => {
    const sha = '1'.repeat(40);
    const source = 'int main() { return 9; }\n';
    const revision = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({
      runtimeId: 'cpp', source, executionMode: 'raw',
      githubRepositoryUrl: 'https://github.com/octo/bot', githubCommitSha: sha,
    });
    expect(revision.status).toBe(201);
    expect(revision.body).toMatchObject({ githubRepositoryUrl: 'https://github.com/octo/bot', githubCommitSha: sha });
    expect((await agent.get(`/api/bots/${botId}/revisions/${revision.body.revisionId}`)).body.source).toBe(source);
  });

  it('rejects incomplete or invalid client GitHub provenance', async () => {
    const base = { runtimeId: 'cpp', source: 'int main() { return 0; }\n' };
    expect((await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ ...base, githubRepositoryUrl: 'https://evil.example/repo', githubCommitSha: '2'.repeat(40) })).status).toBe(400);
    expect((await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ ...base, githubRepositoryUrl: 'https://github.com/octo/bot' })).status).toBe(400);
  });

  it('imports the root main.cpp through GitHub Contents API at a pinned commit', async () => {
    const sha = 'b'.repeat(40);
    mockGitHub('int main() { return 7; }\n', sha);
    const response = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'cpp' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ botId, githubRepositoryUrl: 'https://github.com/octo/bot', githubCommitSha: sha });
    const stored = await agent.get(`/api/bots/${botId}/revisions/${response.body.revisionId}`);
    expect(stored.body.source).toBe('int main() { return 7; }\n');
  });

  it('imports Python main.py and selects the new immutable revision', async () => {
    const sha = 'c'.repeat(40);
    mockGitHub('print("ok")\n', sha, 'main.py');
    const response = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'python3' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      botId, runtimeId: 'python3', githubRepositoryUrl: 'https://github.com/octo/bot', githubCommitSha: sha,
      selected: false,
    });
    const selected = await agent.post(`/api/bots/${botId}/revisions/${response.body.revisionId}/select`)
      .set('x-csrf-token', csrf).send({});
    expect(selected.status).toBe(200);
    expect((await agent.get(`/api/bots/${botId}`)).body.currentRevisionId).toBe(response.body.revisionId);
    expect((await agent.get(`/api/bots/${botId}/revisions/${response.body.revisionId}`)).body.source).toBe('print("ok")\n');
  });

  it('maps private, missing and rate-limited repositories without creating revisions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/private/bot')) return new Response(JSON.stringify({ private: true, default_branch: 'main' }), { status: 200 });
      if (url.includes('/repos/missing/bot')) return new Response('', { status: 404 });
      if (url.includes('/repos/limited/bot')) return new Response('', { status: 429 });
      return new Response('', { status: 404 });
    }));

    const privateRepo = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/private/bot', runtimeId: 'cpp' });
    const missingRepo = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/missing/bot', runtimeId: 'cpp' });
    const limitedRepo = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/limited/bot', runtimeId: 'cpp' });

    expect(privateRepo.status).toBe(404);
    expect(missingRepo.status).toBe(404);
    expect(limitedRepo.status).toBe(429);
    expect((await agent.get(`/api/bots/${botId}/revisions`)).body).toEqual([]);
  });

  it('rejects missing source files, malformed Contents responses and oversized downloads', async () => {
    mockGitHub('no bot source', 'a'.repeat(40), 'README.md');
    const missingSource = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'cpp' });
    expect(missingSource.status).toBe(400);

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/octo/bot/commits/')) return new Response(JSON.stringify({ sha: 'd'.repeat(40) }), { status: 200 });
      if (url.includes('/contents/main.cpp?ref=')) return new Response('{"type":"file","path":"main.cpp"}', { status: 200 });
      if (url.includes('/repos/octo/bot')) return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
      return new Response('', { status: 404 });
    }));
    const malformedContents = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'cpp' });
    expect(malformedContents.status).toBe(422);

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/octo/bot/commits/')) return new Response(JSON.stringify({ sha: 'e'.repeat(40) }), { status: 200 });
      if (url.includes('/contents/main.cpp?ref=')) return new Response('too large', {
        status: 200, headers: { 'content-length': String(256 * 1024 + 1) },
      });
      if (url.includes('/repos/octo/bot')) return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
      return new Response('', { status: 404 });
    }));
    const oversizedContents = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'cpp' });
    expect(oversizedContents.status).toBe(413);
    expect((await agent.get(`/api/bots/${botId}/revisions`)).body).toEqual([]);
  });

  it('rejects unsafe GitHub URLs and non-root Contents paths without executing source', async () => {
    const invalid = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'http://github.com/octo/bot', runtimeId: 'cpp' });
    expect(invalid.status).toBe(400);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/repos/octo/bot/commits/')) return new Response(JSON.stringify({ sha: 'f'.repeat(40) }), { status: 200 });
      if (url.includes('/contents/main.cpp?ref=')) return new Response(JSON.stringify({
        type: 'file', name: 'main.cpp', path: 'subdir/main.cpp', encoding: 'base64', content: Buffer.from('int main() {}').toString('base64'),
      }), { status: 200 });
      if (url.includes('/repos/octo/bot')) return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
      return new Response('', { status: 404 });
    }));
    const unsafeContents = await agent.post(`/api/bots/${botId}/revisions/github`).set('x-csrf-token', csrf)
      .send({ githubUrl: 'https://github.com/octo/bot', runtimeId: 'cpp' });
    expect(unsafeContents.status).toBe(422);
  });

  it('preserves historical Node.js revisions as readable legacy records', async () => {
    const source = 'console.log("legacy");\n';
    const storageRef = `bot-revisions/${botId}/legacy.js`;
    await fs.mkdir(path.join(dir, 'bot-revisions', botId), { recursive: true });
    await fs.writeFile(path.join(dir, storageRef), source, 'utf8');
    const db = new Database(path.join(dir, 'arena.sqlite'));
    try {
      db.prepare(`INSERT INTO bot_revisions
        (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('legacy-revision-000000000000000000000000000000', botId, userId, createHash('sha256').update(source).digest('hex'), storageRef, 'nodejs', new Date().toISOString(), Buffer.byteLength(source), 'legacy');
    } finally { db.close(); }
    const list = await agent.get(`/api/bots/${botId}/revisions`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ runtimeId: 'nodejs', label: 'legacy' })]));
    const legacy = list.body.find((item: { runtimeId: string }) => item.runtimeId === 'nodejs');
    expect((await agent.get(`/api/bots/${botId}/revisions/${legacy.revisionId}`)).body.source).toBe(source);
  });

  it('keeps source integrity failures visible and denies organizers', async () => {
    const revision = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', source: 'int main() { return 0; }' });
    expect(revision.status).toBe(201);
    const artifact = path.join(dir, 'bot-revisions', botId, `${revision.body.revisionId}.cpp`);
    await fs.writeFile(artifact, 'const tampered = true;', 'utf8');
    expect((await agent.get(`/api/bots/${botId}/revisions/${revision.body.revisionId}`)).status).toBe(500);

    const organizer = await createControlledAccount(path.join(dir, 'arena.sqlite'), `org${Date.now()}`, password, 'organizer');
    const organizerAgent = request.agent(appExport);
    await organizerAgent.post('/api/auth/login').send({ username: organizer.username, password });
    expect((await organizerAgent.get(`/api/bots/${botId}/revisions`)).status).toBe(403);
  });

  it('denies cross-account access and keeps legacy Bot CRUD available', async () => {
    const other = request.agent(appExport);
    const auth = await other.post('/api/auth/register').send({ username: `other${Date.now()}`, password });
    const revision = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf).send({ runtimeId: 'cpp', source: 'int main() { return 0; }' });
    expect(revision.status).toBe(201);
    expect((await other.get(`/api/bots/${botId}/revisions`)).status).toBe(404);
    expect((await other.get(`/api/bots/${botId}/revisions/${revision.body.revisionId}`)).status).toBe(404);
    expect((await other.post(`/api/bots/${botId}/revisions/${revision.body.revisionId}/select`).set('x-csrf-token', auth.body.csrfToken).send({})).status).toBe(404);
    expect((await agent.put(`/api/bots/${botId}`).set('x-csrf-token', csrf).send({ name: 'Renamed', command: 'node', args: ['bot.js'] })).status).toBe(200);
  });

  it('rejects path-shaped input and does not execute source during persistence', async () => {
    const response = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', source: '../not-a-path-operation' });
    expect(response.status).toBe(201);
    const stored = await agent.get(`/api/bots/${botId}/revisions/${response.body.revisionId}`);
    expect(stored.body.source).toBe('../not-a-path-operation');
  });

  it('supports the new Bot flow with an immutable C++17 or Python 3 initial revision', async () => {
    for (const [index, runtimeId] of ['cpp', 'python3'].entries()) {
      const bot = await agent.post('/api/bots').set('x-csrf-token', csrf)
        .send({ name: `Source-first-${index}`, command: 'node', args: [] });
      expect(bot.status).toBe(201);

      const source = runtimeId === 'cpp' ? 'int main() { return 0; }\n' : 'print("ok")\n';
      const revision = await agent.post(`/api/bots/${bot.body.id}/revisions`).set('x-csrf-token', csrf)
        .send({ runtimeId, source });
      expect(revision.status).toBe(201);

      const selected = await agent.post(`/api/bots/${bot.body.id}/revisions/${revision.body.revisionId}/select`)
        .set('x-csrf-token', csrf).send({});
      expect(selected.status).toBe(200);
      expect((await agent.get(`/api/bots/${bot.body.id}`)).body.currentRevisionId).toBe(revision.body.revisionId);
    }
  });

  it('pins the selected strategy SDK identity without changing raw-source compatibility', async () => {
    const sdk = await getStrategySdkIdentity('cpp');
    const source = `Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }\n`;
    const revision = await agent.post(`/api/bots/${botId}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', executionMode: 'strategy', source, label: 'strategy starter' });
    expect(revision.status).toBe(201);
    expect(revision.body).toMatchObject({ executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest });

    const read = await agent.get(`/api/bots/${botId}/revisions/${revision.body.revisionId}`);
    expect(read.status).toBe(200);
    expect(read.body.source).toBe(source);
    expect(read.body.sdkDigest).toBe(sdk.digest);
    await agent.post(`/api/bots/${botId}/revisions/${revision.body.revisionId}/select`).set('x-csrf-token', csrf).send({});
    expect((await agent.get('/api/bots')).body.find((item: { id: string }) => item.id === botId).selectedRevision).toMatchObject({
      revisionId: revision.body.revisionId, runtimeId: 'cpp', executionMode: 'strategy', label: 'strategy starter',
    });
  });

  it('keeps a newly created Bot recoverable when its first revision is rejected', async () => {
    const bot = await agent.post('/api/bots').set('x-csrf-token', csrf)
      .send({ name: 'Recoverable Source Bot', command: 'node', args: [] });
    expect(bot.status).toBe(201);

    const rejected = await agent.post(`/api/bots/${bot.body.id}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'javascript', source: 'console.log(1);' });
    expect(rejected.status).toBe(400);
    expect((await agent.get(`/api/bots/${bot.body.id}`)).status).toBe(200);

    const retry = await agent.post(`/api/bots/${bot.body.id}/revisions`).set('x-csrf-token', csrf)
      .send({ runtimeId: 'python3', source: 'print("retry")\n' });
    expect(retry.status).toBe(201);
  });
});
