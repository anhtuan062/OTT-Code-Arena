import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';

describe('server-enforced role separation', () => {
  let dir: string;
  let competitor: ReturnType<typeof request.agent>;
  let competitorCsrf: string;
  let organizer: ReturnType<typeof request.agent>;
  let organizerCsrf: string;
  let secondOrganizer: ReturnType<typeof request.agent>;
  let secondOrganizerCsrf: string;

  async function login(username: string) {
    const agent = request.agent(appExport);
    const result = await agent.post('/api/auth/login').send({ username, password: 'correct horse battery staple' });
    return { agent, csrf: result.body.csrfToken as string };
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-rbac-'));
    await initServer(dir);
    competitor = request.agent(appExport);
    const competitorAccount = await competitor.post('/api/auth/register').send({ username: `competitor${Date.now()}`, password: 'correct horse battery staple' });
    competitorCsrf = competitorAccount.body.csrfToken;
    const organizerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `organizer${Date.now()}`, 'correct horse battery staple', 'organizer');
    const secondOrganizerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `organizer2${Date.now()}`, 'correct horse battery staple', 'organizer');
    ({ agent: organizer, csrf: organizerCsrf } = await login(organizerAccount.username));
    ({ agent: secondOrganizer, csrf: secondOrganizerCsrf } = await login(secondOrganizerAccount.username));
  });

  afterEach(async () => {
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('allows competitor Bot CRUD and denies organizer Bot CRUD', async () => {
    const created = await competitor.post('/api/bots').set('x-csrf-token', competitorCsrf).send({ name: 'owned', command: 'node', args: ['bot.js'] });
    expect(created.status).toBe(201);
    expect((await competitor.get('/api/bots')).status).toBe(200);
    expect((await organizer.get('/api/bots')).status).toBe(403);
    expect((await organizer.post('/api/bots').set('x-csrf-token', organizerCsrf).send({ name: 'wrong-role', command: 'node', args: ['bot.js'] })).status).toBe(403);
    expect((await organizer.delete(`/api/bots/${created.body.id}`).set('x-csrf-token', organizerCsrf)).status).toBe(403);
  });

  it('allows only organizers to create and manage their own tournaments', async () => {
    expect((await competitor.post('/api/tournaments').set('x-csrf-token', competitorCsrf).send({ name: 'not allowed' })).status).toBe(403);
    const created = await organizer.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'owned tournament' });
    expect(created.status).toBe(201);
    const id = created.body.tournamentId as string;
    expect((await organizer.get(`/api/tournaments/${id}`)).status).toBe(200);
    expect((await secondOrganizer.get(`/api/tournaments/${id}`)).status).toBe(404);
    expect((await secondOrganizer.post(`/api/tournaments/${id}/action`).set('x-csrf-token', secondOrganizerCsrf).send({ action: 'open_registration' })).status).toBe(404);
    expect((await competitor.get(`/api/tournaments/${id}`)).status).toBe(403);
  });

  it('blocks the legacy direct-registration workflow without changing the tournament', async () => {
    const created = await organizer.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'approval required' });
    const id = created.body.tournamentId as string;
    const before = await organizer.get(`/api/tournaments/${id}`);
    const response = await organizer.post(`/api/tournaments/${id}/register`).set('x-csrf-token', organizerCsrf).send({ botId: 'bot', participantName: 'participant' });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('participation requests');
    const after = await organizer.get(`/api/tournaments/${id}`);
    expect(after.body.participants).toEqual(before.body.participants);
  });

  it('restricts queue status to an owned organizer tournament task', async () => {
    const own = await organizer.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'queue owner' });
    const other = await secondOrganizer.post('/api/tournaments').set('x-csrf-token', secondOrganizerCsrf).send({ name: 'queue other' });
    expect((await competitor.get('/api/system/queue')).status).toBe(403);
    const ownAggregate = await organizer.get('/api/system/queue');
    expect(ownAggregate.status).toBe(200);
    expect(ownAggregate.body.activeCount).toBe(0);
    expect(ownAggregate.body.queueLength).toBe(0);
    const otherAggregate = await secondOrganizer.get('/api/system/queue');
    expect(otherAggregate.status).toBe(200);
    expect(otherAggregate.body.activeCount).toBe(0);
    expect(otherAggregate.body.queueLength).toBe(0);
    expect((await organizer.get(`/api/system/queue?id=run_all_${other.body.tournamentId}`)).status).toBe(404);
    expect((await organizer.get(`/api/system/queue?id=run_all_${own.body.tournamentId}`)).status).toBe(200);
  });
});
