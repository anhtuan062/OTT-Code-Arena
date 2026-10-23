import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { appExport, closeServer, getTournamentManager, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { getSharedDatabase } from '../../server/db.js';
import { applicationMetrics } from '../../observability/metrics.js';

describe('authentication and ownership API', () => {
  let dir: string;
  beforeEach(async () => { dir = path.join(os.tmpdir(), `ott-auth-${Date.now()}-${Math.random()}`); await fs.mkdir(dir); await initServer(dir); });
  afterEach(async () => { closeServer(); await fs.rm(dir, { recursive: true, force: true }); });
  async function account(name: string) { const agent = request.agent(appExport); const response = await agent.post('/api/auth/register').send({ username: name, password: 'correct horse battery staple' }); return { agent, csrf: response.body.csrfToken, response }; }
  function sessionForUser(userId: string) {
    return getSharedDatabase().prepare('SELECT * FROM sessions WHERE user_id = ?').get(userId) as any;
  }
  function setSessionActivity(userId: string, lastActiveAt: string, expiresAt: string) {
    getSharedDatabase().prepare('UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE user_id = ?').run(lastActiveAt, expiresAt, userId);
  }
  function counter(name: string): number { return applicationMetrics.snapshot().counters[name] ?? 0; }

  it('throttles repeated authenticated GET session touches using persisted timestamps', async () => {
    const a = await account('touchrepeat');
    const old = new Date(Date.now() - 120_000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSessionActivity(a.response.body.user.id, old, future);
    const beforeUpdates = counter('session.touch_updates');
    const beforeSkips = counter('session.touch_skips');

    const responses = await Promise.all(Array.from({ length: 5 }, () => a.agent.get('/api/auth/me')));

    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(counter('session.touch_updates') - beforeUpdates).toBe(1);
    expect(counter('session.touch_skips') - beforeSkips).toBeGreaterThanOrEqual(4);
  });

  it('touches at the inactivity boundary and extends the persisted sliding expiry', async () => {
    const a = await account('touchboundary');
    const nearlyDue = new Date(Date.now() - 59_000).toISOString();
    const originalExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setSessionActivity(a.response.body.user.id, nearlyDue, originalExpiry);
    const before = sessionForUser(a.response.body.user.id);
    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    const notDue = sessionForUser(a.response.body.user.id);
    expect(notDue.last_active_at).toBe(before.last_active_at);

    const due = new Date(Date.now() - 61_000).toISOString();
    setSessionActivity(a.response.body.user.id, due, originalExpiry);
    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    const touched = sessionForUser(a.response.body.user.id);
    expect(new Date(touched.last_active_at).getTime()).toBeGreaterThan(new Date(due).getTime());
    expect(new Date(touched.expires_at).getTime()).toBeGreaterThan(new Date(originalExpiry).getTime());
  });

  it('does not revive a logged-out session', async () => {
    const a = await account('touchlogout');
    expect((await a.agent.post('/api/auth/logout').set('x-csrf-token', a.csrf)).status).toBe(204);
    expect((await a.agent.get('/api/auth/me')).status).toBe(401);
    expect(sessionForUser(a.response.body.user.id)).toBeUndefined();
  });

  it('touches multiple users independently', async () => {
    const a = await account('touchmulti');
    const b = await account('touchmultib');
    const old = new Date(Date.now() - 120_000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setSessionActivity(a.response.body.user.id, old, future);
    setSessionActivity(b.response.body.user.id, old, future);
    const beforeUpdates = counter('session.touch_updates');

    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    expect((await b.agent.get('/api/auth/me')).status).toBe(200);

    expect(counter('session.touch_updates') - beforeUpdates).toBe(2);
    expect(sessionForUser(a.response.body.user.id).last_active_at).not.toBe(old);
    expect(sessionForUser(b.response.body.user.id).last_active_at).not.toBe(old);
  });

  it('uses the persisted session timestamp after server reinitialization', async () => {
    const a = await account('touchrestart');
    const old = new Date(Date.now() - 120_000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setSessionActivity(a.response.body.user.id, old, future);
    await initServer(dir);

    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    expect(sessionForUser(a.response.body.user.id).last_active_at).not.toBe(old);
  });

  it('hashes passwords, restores a session, and invalidates it at logout', async () => {
    const a = await account('alice'); expect(a.response.status).toBe(201);
    expect((await a.agent.get('/api/auth/me')).body.user.username).toBe('alice');
    expect((await a.agent.post('/api/auth/logout').set('x-csrf-token', a.csrf)).status).toBe(204);
    expect((await a.agent.get('/api/auth/me')).status).toBe(401);
    expect((await request(appExport).post('/api/auth/login').send({ username: 'alice', password: 'wrong password' })).status).toBe(401);
  });

  it('requires authentication and CSRF for state changes', async () => {
    expect((await request(appExport).get('/api/bots')).status).toBe(401);
    const a = await account('alice');
    expect((await a.agent.post('/api/bots').send({ name: 'x', command: 'node', args: ['bot.js'] })).status).toBe(403);
  });

  it('does not expose or mutate another users bot', async () => {
    const a = await account('alice'); const b = await account('bobby');
    const bot = await a.agent.post('/api/bots').set('x-csrf-token', a.csrf).send({ name: 'private', command: 'node', args: ['bot.js'] });
    expect((await b.agent.get(`/api/bots/${bot.body.id}`)).status).toBe(404);
    expect((await b.agent.delete(`/api/bots/${bot.body.id}`).set('x-csrf-token', b.csrf)).status).toBe(404);
    expect((await b.agent.put(`/api/bots/${bot.body.id}`).set('x-csrf-token', b.csrf).send({ name: 'stolen', command: 'node', args: ['bot.js'] })).status).toBe(404);
  });

  it('deletes a Bot and its unused immutable source revisions', async () => {
    const a = await account('revisionowner');
    const bot = await a.agent.post('/api/bots')
      .set('x-csrf-token', a.csrf)
      .send({ name: 'source-bot', command: 'node', args: ['bot.js'] });
    expect(bot.status).toBe(201);

    const revision = await a.agent.post(`/api/bots/${bot.body.id}/revisions`)
      .set('x-csrf-token', a.csrf)
      .send({ runtimeId: 'cpp', executionMode: 'raw', source: 'int main() { return 0; }' });
    expect(revision.status).toBe(201);

    const deletion = await a.agent.delete(`/api/bots/${bot.body.id}`).set('x-csrf-token', a.csrf);
    expect(deletion.status).toBe(204);
    expect((await a.agent.get(`/api/bots/${bot.body.id}`)).status).toBe(404);
    expect((await a.agent.get(`/api/bots/${bot.body.id}/revisions`)).status).toBe(404);
  });

  it('persists users and bots across server reinitialization', async () => {
    const a = await account('alice'); await a.agent.post('/api/bots').set('x-csrf-token', a.csrf).send({ name: 'persisted', command: 'node', args: ['bot.js'] });
    await initServer(dir);
    const login = await request.agent(appExport).post('/api/auth/login').send({ username: 'alice', password: 'correct horse battery staple' });
    expect(login.status).toBe(200);
  });

  it('rejects duplicate users without creating a second account', async () => {
    const first = await account('alice');
    expect(first.response.status).toBe(201);
    const duplicate = await request(appExport)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'another correct password' });
    expect(duplicate.status).toBe(409);
    expect((await request(appExport).post('/api/auth/login').send({
      username: 'alice',
      password: 'correct horse battery staple',
    })).status).toBe(200);
  });

  it('keeps tournaments and replays private across users', async () => {
    const organizer = await createControlledAccount(path.join(dir, 'arena.sqlite'), 'ownerorganizer', 'correct horse battery staple', 'organizer');
    const ownerAgent = request.agent(appExport);
    const ownerLogin = await ownerAgent.post('/api/auth/login').send({ username: organizer.username, password: 'correct horse battery staple' });
    const owner = { agent: ownerAgent, csrf: ownerLogin.body.csrfToken };
    const other = await account('other');
    const tournament = await owner.agent
      .post('/api/tournaments')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'private tournament' });
    const tournamentId = tournament.body.tournamentId;

    expect((await other.agent.get(`/api/tournaments/${tournamentId}`)).status).toBe(403);
    expect((await other.agent.post(`/api/tournaments/${tournamentId}/register`)
      .set('x-csrf-token', other.csrf)
      .send({ botId: 'not-owned', participantName: 'stolen' })).status).toBe(403);
    expect((await other.agent.post(`/api/tournaments/${tournamentId}/action`)
      .set('x-csrf-token', other.csrf)
      .send({ action: 'open_registration' })).status).toBe(403);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/standings`)).status).toBe(403);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/stats`)).status).toBe(403);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/replays/not-owned`)).status).toBe(403);
  });

  it('keeps replay authorization independent from publication state', async () => {
    const organizer = await createControlledAccount(path.join(dir, 'arena.sqlite'), 'cacheowner', 'correct horse battery staple', 'organizer');
    const ownerAgent = request.agent(appExport);
    const ownerLogin = await ownerAgent.post('/api/auth/login').send({ username: organizer.username, password: 'correct horse battery staple' });
    const other = await account('cacheviewer');
    const created = await ownerAgent.post('/api/tournaments')
      .set('x-csrf-token', ownerLogin.body.csrfToken)
      .send({ name: 'Replay cache publication' });
    const tournamentId = created.body.tournamentId as string;
    const matchId = `${tournamentId}-p-cache`;
    const result = {
      matchId, replayRef: matchId, pairingId: 'p-cache', participantA: 'bot-a', participantB: 'bot-b', winner: 'A',
      completedAt: new Date().toISOString(),
    } as any;
    const replay = { matchId, moves: [], initialState: {}, finalState: {}, winner: 'A', terminationReason: 'unknown' };
    const manager = getTournamentManager() as any;
    const repository = manager.repository;
    const tournament = (await manager.loadTournament(tournamentId)).data;
    tournament.status = 'completed';
    tournament.resultsPublishedAt = null;
    tournament.rounds = [{ roundNumber: 1, pairings: [{ pairingId: 'p-cache', matchId, participantA: 'bot-a', participantB: 'bot-b', status: 'completed', matchResult: result }] }];
    await repository.saveMatchResult(tournamentId, matchId, result, replay);
    await repository.save(tournament);

    expect((await ownerAgent.get(`/api/tournaments/${tournamentId}/replays/${matchId}`)).status).toBe(200);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/replays/${matchId}`)).status).toBe(200);

    tournament.resultsPublishedAt = new Date().toISOString();
    await repository.save(tournament);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/replays/${matchId}`)).status).toBe(200);

    tournament.resultsPublishedAt = null;
    await repository.save(tournament);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/replays/${matchId}`)).status).toBe(200);
  });
});
