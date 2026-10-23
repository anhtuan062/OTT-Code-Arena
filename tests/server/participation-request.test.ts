import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';

const password = 'correct horse battery staple';

describe('tournament participation requests', () => {
  let dir: string;
  let competitor: ReturnType<typeof request.agent>;
  let competitorCsrf: string;
  let otherCompetitor: ReturnType<typeof request.agent>;
  let otherCompetitorCsrf: string;
  let organizer: ReturnType<typeof request.agent>;
  let organizerCsrf: string;
  let otherOrganizer: ReturnType<typeof request.agent>;
  let otherOrganizerCsrf: string;

  async function login(username: string) {
    const agent = request.agent(appExport);
    const response = await agent.post('/api/auth/login').send({ username, password });
    expect(response.status).toBe(200);
    return { agent, csrf: response.body.csrfToken as string };
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-participation-'));
    await initServer(dir);

    competitor = request.agent(appExport);
    const competitorResponse = await competitor.post('/api/auth/register').send({
      username: `competitor${Date.now()}`,
      password,
    });
    competitorCsrf = competitorResponse.body.csrfToken;

    otherCompetitor = request.agent(appExport);
    const otherCompetitorResponse = await otherCompetitor.post('/api/auth/register').send({
      username: `competitor2${Date.now()}`,
      password,
    });
    otherCompetitorCsrf = otherCompetitorResponse.body.csrfToken;

    const organizerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `organizer${Date.now()}`, password, 'organizer');
    const otherOrganizerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `organizer2${Date.now()}`, password, 'organizer');
    ({ agent: organizer, csrf: organizerCsrf } = await login(organizerAccount.username));
    ({ agent: otherOrganizer, csrf: otherOrganizerCsrf } = await login(otherOrganizerAccount.username));
  });

  afterEach(async () => {
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function createPublicTournament() {
    const response = await organizer.post('/api/tournaments')
      .set('x-csrf-token', organizerCsrf)
      .send({ name: 'Open arena', visibility: 'public' });
    expect(response.status).toBe(201);
    const tournamentId = response.body.tournamentId as string;
    const opened = await organizer.post(`/api/tournaments/${tournamentId}/action`)
      .set('x-csrf-token', organizerCsrf)
      .send({ action: 'open_registration' });
    expect(opened.status).toBe(200);
    return tournamentId;
  }

  async function createBot(agent: ReturnType<typeof request.agent>, csrf: string, name: string) {
    const response = await agent.post('/api/bots')
      .set('x-csrf-token', csrf)
      .send({ name, command: 'node', args: ['bot.js'] });
    expect(response.status).toBe(201);
    const revision = await agent.post(`/api/bots/${response.body.id}/revisions`)
      .set('x-csrf-token', csrf)
      .send({ runtimeId: 'cpp', executionMode: 'strategy', source: 'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }' });
    expect(revision.status).toBe(201);
    return { botId: response.body.id as string, revisionId: revision.body.revisionId as string, sdkDigest: revision.body.sdkDigest as string };
  }

  it('exposes all tournaments and accepts an owned Bot request', async () => {
    const publicId = await createPublicTournament();
    const privateResponse = await organizer.post('/api/tournaments')
      .set('x-csrf-token', organizerCsrf)
      .send({ name: 'Private arena' });
    expect(privateResponse.status).toBe(201);
    await organizer.patch(`/api/tournaments/${privateResponse.body.tournamentId}`)
      .set('x-csrf-token', organizerCsrf)
      .send({ schedule: { visibleAt: new Date(Date.now() - 1000).toISOString() } });

    const bot = await createBot(competitor, competitorCsrf, 'owned bot');
    const discovery = await competitor.get('/api/tournaments/discoverable');
    expect(discovery.status).toBe(200);
    expect(discovery.body.map((item: { tournamentId: string }) => item.tournamentId)).toContain(publicId);
    expect(discovery.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ tournamentId: privateResponse.body.tournamentId }),
    ]));
    expect(discovery.body[0]).not.toHaveProperty('participants');
    expect(discovery.body[0]).not.toHaveProperty('participationRequests');

    const botNameAsParticipant = await competitor.post(`/api/tournaments/${publicId}/participation-requests`)
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'owned bot' });
    expect(botNameAsParticipant.status).toBe(409);
    expect(botNameAsParticipant.body.error).toContain('khác tên Bot');

    const created = await competitor.post(`/api/tournaments/${publicId}/participation-requests`)
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Competitor One' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      botId: bot.botId,
      revisionId: bot.revisionId,
      participantName: 'Competitor One',
      status: 'pending',
      preflight: expect.objectContaining({ status: expect.not.stringMatching(/^not_started$/) }),
    });
    expect(created.body).not.toHaveProperty('competitorId');
    expect(created.body).not.toHaveProperty('botSnapshot');

    const otherBot = await createBot(otherCompetitor, otherCompetitorCsrf, 'other bot');
    const duplicateDisplayName = await otherCompetitor.post(`/api/tournaments/${publicId}/participation-requests`)
      .set('x-csrf-token', otherCompetitorCsrf)
      .send({ botId: otherBot.botId, revisionId: otherBot.revisionId, participantName: 'Competitor One' });
    expect(duplicateDisplayName.status).toBe(409);
    expect(duplicateDisplayName.body.error).toContain('already in use');

    const discoveryWithStatus = await competitor.get('/api/tournaments/discoverable');
    expect(discoveryWithStatus.status).toBe(200);
    expect(discoveryWithStatus.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ tournamentId: publicId, myRequestStatus: 'pending' }),
    ]));
    expect((await otherCompetitor.get('/api/tournaments/discoverable')).body).toEqual(expect.arrayContaining([
      expect.objectContaining({ tournamentId: publicId, myRequestStatus: null }),
    ]));

    const mine = await competitor.get(`/api/tournaments/${publicId}/participation-requests/mine`);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    const projection = await competitor.get('/api/my/tournaments');
    expect(projection.status).toBe(200);
    expect(projection.body).toMatchObject([{
      tournamentId: publicId,
      status: 'registration_open',
      participantCount: 0,
      request: { botId: bot.botId, revisionId: bot.revisionId, status: 'pending' },
      resultsPublished: false,
    }]);
    expect(projection.body[0]).not.toHaveProperty('competitorId');
    expect((await otherCompetitor.get('/api/my/tournaments')).body).toEqual([]);
    expect((await organizer.get('/api/my/tournaments')).status).toBe(403);
    expect((await organizer.get(`/api/tournaments/${publicId}`)).body.participants).toHaveLength(0);
  });

  it('enforces ownership, CSRF, duplicate protection, and organizer review', async () => {
    const tournamentId = await createPublicTournament();
    const bot = await createBot(competitor, competitorCsrf, 'owned bot');
    const otherBot = await createBot(otherCompetitor, otherCompetitorCsrf, 'other bot');

    expect((await competitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Missing CSRF' })).status).toBe(403);
    expect((await otherCompetitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', otherCompetitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Not owner' })).status).toBe(404);

    const pending = await competitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Competitor One' });
    expect(pending.status).toBe(201);
    const requestId = pending.body.requestId as string;

    const laterRevision = await competitor.post(`/api/bots/${bot.botId}/revisions`)
      .set('x-csrf-token', competitorCsrf)
      .send({ runtimeId: 'python3', source: 'print("later")' });
    expect(laterRevision.status).toBe(201);
    expect((await competitor.post(`/api/bots/${bot.botId}/revisions/${laterRevision.body.revisionId}/select`)
      .set('x-csrf-token', competitorCsrf).send({})).status).toBe(200);

    expect((await competitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Duplicate' })).status).toBe(409);
    expect((await otherOrganizer.get(`/api/tournaments/${tournamentId}/requests`)).status).toBe(404);
    expect((await otherOrganizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/preflight/retry`)
      .set('x-csrf-token', otherOrganizerCsrf)).status).toBe(404);
    expect((await organizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/preflight/retry`)).status).toBe(403);
    expect((await organizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/preflight/retry`)
      .set('x-csrf-token', organizerCsrf)).status).toBe(202);
    expect((await organizer.get(`/api/tournaments/${tournamentId}/requests`)).body).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId, botId: bot.botId, revisionId: bot.revisionId, status: 'pending' }),
    ]));

    const approved = await organizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/approve`)
      .set('x-csrf-token', organizerCsrf)
      .send();
    expect(approved.status).toBe(409);
    expect(approved.body.error).toContain('preflight');
    expect((await organizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/approve`)
      .set('x-csrf-token', organizerCsrf)).status).toBe(409);
    const trackedAfterApproval = await competitor.get(`/api/tournaments/${tournamentId}/participation-requests/mine`);
    expect(trackedAfterApproval.status).toBe(200);
    expect(trackedAfterApproval.body).toMatchObject([{ requestId, status: 'pending' }]);
    expect((await competitor.get('/api/my/tournaments')).body).toEqual(expect.arrayContaining([
      expect.objectContaining({ tournamentId, participantCount: 0 }),
    ]));

    const secondRequest = await otherCompetitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', otherCompetitorCsrf)
      .send({ botId: otherBot.botId, revisionId: otherBot.revisionId, participantName: 'Competitor Two' });
    expect(secondRequest.status).toBe(201);
    expect((await organizer.post(`/api/tournaments/${tournamentId}/action`)
      .set('x-csrf-token', organizerCsrf)
      .send({ action: 'close_registration' })).status).toBe(400);

    const rejected = await organizer.post(`/api/tournaments/${tournamentId}/requests/${secondRequest.body.requestId}/reject`)
      .set('x-csrf-token', organizerCsrf)
      .send({ reason: 'Capacity' });
    expect(rejected.status).toBe(200);
    expect((await organizer.post(`/api/tournaments/${tournamentId}/requests/${secondRequest.body.requestId}/preflight/retry`)
      .set('x-csrf-token', organizerCsrf)).status).toBe(409);
    expect(rejected.body.participants).toHaveLength(0);
    expect(rejected.body.participationRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId: secondRequest.body.requestId, status: 'rejected', rejectionReason: 'Capacity' }),
    ]));
    const rejectedFirst = await organizer.post(`/api/tournaments/${tournamentId}/requests/${requestId}/reject`)
      .set('x-csrf-token', organizerCsrf)
      .send({ reason: 'Preflight unavailable in test environment' });
    expect(rejectedFirst.status).toBe(200);
    expect((await organizer.post(`/api/tournaments/${tournamentId}/action`)
      .set('x-csrf-token', organizerCsrf)
      .send({ action: 'close_registration' })).status).toBe(200);
    const trackedAfterClose = await competitor.get(`/api/tournaments/${tournamentId}/participation-requests/mine`);
    expect(trackedAfterClose.status).toBe(200);
    expect(trackedAfterClose.body).toMatchObject([{ requestId, status: 'rejected' }]);
    const otherTrackedAfterClose = await otherCompetitor.get(`/api/tournaments/${tournamentId}/participation-requests/mine`);
    expect(otherTrackedAfterClose.status).toBe(200);
    expect(otherTrackedAfterClose.body).toMatchObject([{ requestId: secondRequest.body.requestId, status: 'rejected' }]);
    expect((await competitor.post(`/api/tournaments/${tournamentId}/participation-requests`)
      .set('x-csrf-token', competitorCsrf)
      .send({ botId: bot.botId, revisionId: bot.revisionId, participantName: 'Too late' })).status).toBe(409);
  });
});
