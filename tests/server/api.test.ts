import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { clearExecutorCache } from '@bot-executor/index.js';

describe('Server API Security', () => {
  let testDir: string;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;
  let organizerAgent: ReturnType<typeof request.agent>;
  let organizerCsrf: string;

  beforeEach(async () => {
    clearExecutorCache();
    testDir = path.join(os.tmpdir(), `ott-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    await initServer(testDir);
    agent = request.agent(appExport);
    const auth = await agent.post('/api/auth/register').send({ username: `user${Date.now()}`, password: 'correct horse battery staple' });
    csrf = auth.body.csrfToken;
    const organizer = await createControlledAccount(path.join(testDir, 'arena.sqlite'), `organizer${Date.now()}`, 'correct horse battery staple', 'organizer');
    organizerAgent = request.agent(appExport);
    const organizerLogin = await organizerAgent.post('/api/auth/login').send({ username: organizer.username, password: 'correct horse battery staple' });
    organizerCsrf = organizerLogin.body.csrfToken;
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
      const res = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .set('Content-Type', 'application/json')
        .send('{ "name": "Test", '); // Invalid JSON

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Malformed JSON payload');
    });

    it('should reject excessively large payloads', async () => {
      const largeString = 'a'.repeat(200 * 1024); // 200kb, over 100kb limit
      const res = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: largeString });

      expect(res.status).toBe(413); // Payload Too Large
    });
  });

  describe('Tournament Action Validation', () => {
    it('returns aggregate queue status without a task id and scopes task status to owned tournaments', async () => {
      const aggregate = await organizerAgent.get('/api/system/queue');
      expect(aggregate.status).toBe(200);
      expect(aggregate.body.taskId).toBeNull();
      expect(aggregate.body.status).toBeNull();

      const created = await organizerAgent.post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Queue status validation' });
      const scoped = await organizerAgent.get(`/api/system/queue?id=run_all_${created.body.tournamentId}`);
      expect(scoped.status).toBe(200);
      expect(scoped.body.taskId).toBe(`run_all_${created.body.tournamentId}`);
      expect(scoped.body.status).toBeNull();
    });

    it('should close registration without starting execution or changing the schedule', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Close validation' });
      const tournamentId = created.body.tournamentId;
      expect((await organizerAgent.post(`/api/tournaments/${tournamentId}/action`).set('x-csrf-token', organizerCsrf).send({ action: 'open_registration' })).status).toBe(200);

      const close = await organizerAgent.post(`/api/tournaments/${tournamentId}/action`).set('x-csrf-token', organizerCsrf).send({ action: 'close_registration' });
      const tournament = await organizerAgent.get(`/api/tournaments/${tournamentId}`);

      expect(close.status).toBe(200);
      expect(close.body.status).toBe('registration_closed');
      expect(tournament.body.status).toBe('registration_closed');
      expect(tournament.body.startedAt).toBeNull();
      expect(tournament.body.rounds).toHaveLength(0);
    });

    it('should prevent duplicate run_all tasks', async () => {
      // Create a tournament
      const createRes = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Duplicate Run Test' });
      const tId = createRes.body.tournamentId;

      // It is in 'draft' state. runAllMatches will fail immediately,
      // but the queue submission logic shouldn't allow simultaneous submissions anyway.

      const p1 = organizerAgent
        .post(`/api/tournaments/${tId}/action`)
        .set('x-csrf-token', organizerCsrf)
        .send({ action: 'run_all' });

      const p2 = organizerAgent
        .post(`/api/tournaments/${tId}/action`)
        .set('x-csrf-token', organizerCsrf)
        .send({ action: 'run_all' });

      const [res1, res2] = await Promise.all([p1, p2]);

      // One should succeed (200), one should conflict (409)
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });

    it('restricts result publication to the owning organizer and completed tournaments', async () => {
      const created = await organizerAgent.post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Publication authorization' });
      const tournamentId = created.body.tournamentId as string;

      expect((await request(appExport).post(`/api/tournaments/${tournamentId}/publish`)).status).toBe(401);
      expect((await agent.post(`/api/tournaments/${tournamentId}/publish`)
        .set('x-csrf-token', csrf)).status).toBe(403);
      expect((await organizerAgent.post(`/api/tournaments/${tournamentId}/publish`)).status).toBe(403);
      const rejected = await organizerAgent.post(`/api/tournaments/${tournamentId}/publish`)
        .set('x-csrf-token', organizerCsrf);
      expect(rejected.status).toBe(409);
      expect(rejected.body.error).toContain('status');
      expect((await organizerAgent.get(`/api/tournaments/${tournamentId}`)).body.resultsPublishedAt).toBeNull();
    });

    it('propagates a background run_all failure to the execution queue', async () => {
      const createRes = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Background Failure Test' });
      const tId = createRes.body.tournamentId;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const response = await organizerAgent
          .post(`/api/tournaments/${tId}/action`)
          .set('x-csrf-token', organizerCsrf)
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
      const createRes = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Replay Validation Test' });
      const tId = createRes.body.tournamentId;

      const res = await organizerAgent
        .get(`/api/tournaments/${tId}/replays/random-match-id`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Match does not belong to this tournament');
    });
  });
});
