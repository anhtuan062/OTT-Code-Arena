import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { appExport, closeServer, initServer } from '../../server/index.js';

describe('authentication and ownership API', () => {
  let dir: string;
  beforeEach(async () => { dir = path.join(os.tmpdir(), `ott-auth-${Date.now()}-${Math.random()}`); await fs.mkdir(dir); await initServer(dir); });
  afterEach(async () => { closeServer(); await fs.rm(dir, { recursive: true, force: true }); });
  async function account(name: string) { const agent = request.agent(appExport); const response = await agent.post('/api/auth/register').send({ username: name, password: 'correct horse battery staple' }); return { agent, csrf: response.body.csrfToken, response }; }

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
    const owner = await account('owner');
    const other = await account('other');
    const bot = await owner.agent
      .post('/api/bots')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'owner-bot', command: 'node', args: ['bot.js'] });
    const tournament = await owner.agent
      .post('/api/tournaments')
      .set('x-csrf-token', owner.csrf)
      .send({ name: 'private tournament' });
    const tournamentId = tournament.body.tournamentId;

    expect((await other.agent.get(`/api/tournaments/${tournamentId}`)).status).toBe(404);
    expect((await other.agent.post(`/api/tournaments/${tournamentId}/register`)
      .set('x-csrf-token', other.csrf)
      .send({ botId: bot.body.id, participantName: 'stolen' })).status).toBe(404);
    expect((await other.agent.post(`/api/tournaments/${tournamentId}/action`)
      .set('x-csrf-token', other.csrf)
      .send({ action: 'open_registration' })).status).toBe(404);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/standings`)).status).toBe(404);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/stats`)).status).toBe(404);
    expect((await other.agent.get(`/api/tournaments/${tournamentId}/replays/not-owned`)).status).toBe(404);
  });
});
