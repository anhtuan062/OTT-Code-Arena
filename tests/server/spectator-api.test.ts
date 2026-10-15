import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { createTournament } from '../../tournament/persistence.js';
import { computeStandings } from '../../tournament/scoring.js';

const password = 'correct horse battery staple';

describe('authenticated tournament-wide spectator capability', () => {
  let dir: string;
  let owner: any;
  let viewer: any;
  let other: any;
  const tournamentId = 'spectator-policy';
  const matchId = 'spectator-match-1';

  async function login(account: { id: string; username: string }) {
    const agent = request.agent(appExport);
    const result = await agent.post('/api/auth/login').send({ username: account.username, password });
    return { ...account, agent, csrf: result.body.csrfToken };
  }

  async function writeFixture(status: 'running' | 'completed' = 'running') {
    const tournament = createTournament(tournamentId, 'Spectator policy fixture');
    tournament.status = status;
    tournament.startedAt = new Date().toISOString();
    tournament.completedAt = status === 'completed' ? new Date().toISOString() : null;
    tournament.resultsPublishedAt = null;
    // Legacy fields are intentionally retained to prove they no longer affect authorization.
    tournament.metadata = { ownerId: owner.id, access: 'private', liveSpectatorsEnabled: false };
    tournament.participants = [
      { participantId: 'P1', name: 'Alpha', bot: { botId: 'bot-a', player: 'A', command: 'secret-a', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'P2', name: 'Beta', bot: { botId: 'bot-b', player: 'B', command: 'secret-b', args: [] }, registeredAt: new Date().toISOString() },
    ];
    const completedAt = new Date().toISOString();
    const result = {
      matchId, pairingId: 'P1-v-P2-r1', participantA: 'P1', participantB: 'P2', winner: 'A' as const,
      terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 10, replayRef: matchId, completedAt,
      executionProvenance: [{ player: 'A' as const, competitorId: owner.id, botId: 'bot-a', revisionId: 'secret-revision', runtimeId: 'cpp' as const, sourceDigest: 'secret-digest' }],
      executionDiagnostics: [{ player: 'A' as const, runtimeId: 'cpp' as const, executionMode: 'strategy' as const, exitCode: 0, outputProduced: false, engineAcceptedMove: true }],
    };
    tournament.rounds = [{ roundNumber: 1, pairings: [{ pairingId: result.pairingId, roundNumber: 1, participantA: 'P1', participantB: 'P2', status: status === 'running' ? 'in_progress' : 'completed', matchId, matchResult: status === 'running' ? null : result, startedAt: completedAt, completedAt: status === 'running' ? null : completedAt }] }];
    tournament.standings = computeStandings(tournament.participants, status === 'running' ? [] : [result], tournament.scoringConfig);
    const replay = {
      matchId, protocolVersion: '0.1.0',
      initialState: { boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [], status: 'playing', winner: null, winReason: null, lastMove: null },
      moves: [], finalState: { boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [], status: 'finished', winner: 'A', winReason: 'goal_reached', lastMove: null },
      winner: 'A', terminationReason: 'goal_reached', metadata: { sourceRevisions: result.executionProvenance, executionDiagnostics: result.executionDiagnostics },
    };
    const tournamentDir = path.join(dir, tournamentId);
    await fs.mkdir(tournamentDir, { recursive: true });
    const resultData = JSON.stringify(result, null, 2);
    const replayData = JSON.stringify(replay, null, 2);
    const commit = { matchId, resultHash: createHash('sha256').update(resultData).digest('hex'), replayHash: createHash('sha256').update(replayData).digest('hex') };
    await Promise.all([
      fs.writeFile(path.join(tournamentDir, 'tournament.json'), JSON.stringify(tournament, null, 2)),
      fs.writeFile(path.join(tournamentDir, `match-${matchId}.json`), resultData),
      fs.writeFile(path.join(tournamentDir, `replay-${matchId}.json`), replayData),
      fs.writeFile(path.join(tournamentDir, `match-${matchId}.commit.json`), JSON.stringify(commit, null, 2)),
    ]);
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-spectator-policy-'));
    const ownerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `owner${Date.now()}`, password, 'organizer');
    const viewerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `viewer${Date.now()}`, password, 'competitor');
    const otherAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `other${Date.now()}`, password, 'competitor');
    owner = { ...ownerAccount, agent: request.agent(appExport), csrf: '' };
    viewer = { ...viewerAccount, agent: request.agent(appExport), csrf: '' };
    other = { ...otherAccount, agent: request.agent(appExport), csrf: '' };
    await writeFixture();
    await initServer(dir);
    owner = await login(ownerAccount);
    viewer = await login(viewerAccount);
    other = await login(otherAccount);
  });

  afterEach(async () => {
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('requires authentication but allows every authenticated account to watch a running tournament', async () => {
    expect((await request(appExport).get(`/api/tournaments/${tournamentId}/spectator/matches/${matchId}/live`)).status).toBe(401);
    for (const account of [owner, viewer, other]) {
      const response = await account.agent.get(`/api/tournaments/${tournamentId}/spectator/matches/${matchId}/live`);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
      expect(response.body.authorization).toBe('authenticated');
    }
  });

  it('discovers legacy private tournaments without exposing visibility or execution metadata', async () => {
    const discovery = await other.agent.get('/api/tournaments/discoverable');
    expect(discovery.status).toBe(200);
    expect(discovery.body).toEqual(expect.arrayContaining([expect.objectContaining({ tournamentId, status: 'running' })]));
    const detail = await other.agent.get(`/api/tournaments/${tournamentId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('metadata.access');
    expect(detail.body).not.toHaveProperty('metadata.liveSpectatorsEnabled');
    expect(JSON.stringify(detail.body)).not.toContain('secret-digest');
  });

  it('does not expose active live data after the tournament stops', async () => {
    const tournamentPath = path.join(dir, tournamentId, 'tournament.json');
    const current = JSON.parse(await fs.readFile(tournamentPath, 'utf8'));
    current.status = 'completed';
    current.completedAt = new Date().toISOString();
    const storedResult = JSON.parse(await fs.readFile(path.join(dir, tournamentId, `match-${matchId}.json`), 'utf8'));
    current.rounds[0].pairings[0].status = 'completed';
    current.rounds[0].pairings[0].matchResult = storedResult;
    current.rounds[0].pairings[0].completedAt = storedResult.completedAt;
    current.standings = computeStandings(current.participants, [storedResult], current.scoringConfig);
    await fs.writeFile(tournamentPath, JSON.stringify(current, null, 2));
    const response = await other.agent.get(`/api/tournaments/${tournamentId}/spectator/matches/${matchId}/live`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'unavailable', reason: 'tournament_not_running' });
  });

  it('retires invitation and live opt-in mutations', async () => {
    for (const pathName of [
      `/api/tournaments/${tournamentId}/spectator-entitlements`,
      `/api/tournaments/${tournamentId}/spectator-settings`,
    ]) {
      expect((await owner.agent.post(pathName).set('x-csrf-token', owner.csrf).send({ username: viewer.username, liveSpectatorsEnabled: true })).status).toBe(404);
      expect((await owner.agent.patch(pathName).set('x-csrf-token', owner.csrf).send({ liveSpectatorsEnabled: true })).status).toBe(404);
    }
  });

  it('keeps published Replay available to authenticated viewers and unpublished Replay closed', async () => {
    const beforePublish = await viewer.agent.get(`/api/tournaments/${tournamentId}/spectator/matches/${matchId}/replay`);
    expect(beforePublish.status).toBe(404);
    const tournamentPath = path.join(dir, tournamentId, 'tournament.json');
    const current = JSON.parse(await fs.readFile(tournamentPath, 'utf8'));
    current.status = 'completed';
    current.completedAt = new Date().toISOString();
    const storedResult = JSON.parse(await fs.readFile(path.join(dir, tournamentId, `match-${matchId}.json`), 'utf8'));
    current.rounds[0].pairings[0].status = 'completed';
    current.rounds[0].pairings[0].matchResult = storedResult;
    current.rounds[0].pairings[0].completedAt = storedResult.completedAt;
    current.standings = computeStandings(current.participants, [storedResult], current.scoringConfig);
    await fs.writeFile(tournamentPath, JSON.stringify(current, null, 2));
    const published = await owner.agent.post(`/api/tournaments/${tournamentId}/publish`).set('x-csrf-token', owner.csrf);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const replay = await viewer.agent.get(`/api/tournaments/${tournamentId}/spectator/matches/${matchId}/replay`);
    expect(replay.status).toBe(200);
    expect(replay.body).not.toHaveProperty('metadata');
    expect(replay.body).not.toHaveProperty('sourceCode');
  });
});
