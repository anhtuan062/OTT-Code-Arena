import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { clearExecutorCache } from '@bot-executor/index.js';

describe('Server API Security', () => {
  let testDir: string;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;

  beforeEach(async () => {
    clearExecutorCache();
    testDir = path.join(os.tmpdir(), `ott-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    await initServer(testDir);
    agent = request.agent(appExport);
    const auth = await agent.post('/api/auth/register').send({ username: `user${Date.now()}`, password: 'correct horse battery staple' });
    csrf = auth.body.csrfToken;
  });

  afterEach(async () => {
    clearExecutorCache();
    closeServer();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Bot Registration Validation', () => {
    it('should reject invalid command types', async () => {
      const res = await agent
        .post('/api/bots')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Hacker Bot',
          command: 'bash',
          args: ['-c', 'rm -rf /']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Only node/python commands are allowed');
    });

    it('should reject arguments with flags', async () => {
      const res = await agent
        .post('/api/bots')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Hacker Bot',
          command: 'node',
          args: ['-e', 'console.log("hacked")']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Command flags are not allowed');
    });

    it('should reject arguments with absolute paths', async () => {
      const res = await agent
        .post('/api/bots')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Hacker Bot',
          command: 'node',
          args: ['/etc/passwd']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Path traversal or absolute paths are not allowed');
    });

    it('should reject arguments with path traversal', async () => {
      const res = await agent
        .post('/api/bots')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Hacker Bot',
          command: 'node',
          args: ['../../../../etc/passwd']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Path traversal or absolute paths are not allowed');
    });

    it('should allow valid bot registrations', async () => {
      const res = await agent
        .post('/api/bots')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Valid Bot',
          command: 'node',
          args: ['dist/examples/sample-bot/index.js']
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Valid Bot');
    });
  });

  describe('Payload Limits and Error Handling', () => {
    it('should reject malformed JSON', async () => {
      const res = await agent
        .post('/api/tournaments')
        .set('x-csrf-token', csrf)
        .set('Content-Type', 'application/json')
        .send('{ "name": "Test", '); // Invalid JSON

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Malformed JSON payload');
    });

    it('should reject excessively large payloads', async () => {
      const largeString = 'a'.repeat(200 * 1024); // 200kb, over 100kb limit
      const res = await agent
        .post('/api/tournaments')
        .set('x-csrf-token', csrf)
        .send({ name: largeString });

      expect(res.status).toBe(413); // Payload Too Large
    });
  });

  describe('Tournament Action Validation', () => {
    it('should reject close_registration without a schedule without changing state', async () => {
      const created = await agent.post('/api/tournaments').set('x-csrf-token', csrf).send({ name: 'Close validation' });
      const tournamentId = created.body.tournamentId;
      expect((await agent.post(`/api/tournaments/${tournamentId}/action`).set('x-csrf-token', csrf).send({ action: 'open_registration' })).status).toBe(200);

      const close = await agent.post(`/api/tournaments/${tournamentId}/action`).set('x-csrf-token', csrf).send({ action: 'close_registration' });
      const tournament = await agent.get(`/api/tournaments/${tournamentId}`);

      expect(close.status).toBe(400);
      expect(close.body.error).toContain('No schedule generated');
      expect(tournament.body.status).toBe('registration_open');
      expect(tournament.body.startedAt).toBeNull();
      expect(tournament.body.rounds).toHaveLength(0);
    });

    it('should prevent duplicate run_all tasks', async () => {
      // Create a tournament
      const createRes = await agent
        .post('/api/tournaments')
        .set('x-csrf-token', csrf)
        .send({ name: 'Duplicate Run Test' });
      const tId = createRes.body.tournamentId;

      // It is in 'draft' state. runAllMatches will fail immediately,
      // but the queue submission logic shouldn't allow simultaneous submissions anyway.

      const p1 = agent
        .post(`/api/tournaments/${tId}/action`)
        .set('x-csrf-token', csrf)
        .send({ action: 'run_all' });

      const p2 = agent
        .post(`/api/tournaments/${tId}/action`)
        .set('x-csrf-token', csrf)
        .send({ action: 'run_all' });

      const [res1, res2] = await Promise.all([p1, p2]);

      // One should succeed (200), one should conflict (409)
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });

    it('propagates a background run_all failure to the execution queue', async () => {
      const createRes = await agent
        .post('/api/tournaments')
        .set('x-csrf-token', csrf)
        .send({ name: 'Background Failure Test' });
      const tId = createRes.body.tournamentId;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const response = await agent
          .post(`/api/tournaments/${tId}/action`)
          .set('x-csrf-token', csrf)
          .send({ action: 'run_all' });

        expect(response.status).toBe(200);

        const deadline = Date.now() + 1000;
        while (Date.now() < deadline && !errorSpy.mock.calls.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        expect(errorSpy.mock.calls.some(([message]) =>
          String(message).includes('Execution queue error')
        )).toBe(true);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  describe('Replay API Validation', () => {
    it('should return 404 for a match that does not belong to the tournament', async () => {
      const createRes = await agent
        .post('/api/tournaments')
        .set('x-csrf-token', csrf)
        .send({ name: 'Replay Validation Test' });
      const tId = createRes.body.tournamentId;

      const res = await agent
        .get(`/api/tournaments/${tId}/replays/random-match-id`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Match does not belong to this tournament');
    });
  });
});
