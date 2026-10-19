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

describe('published tournament result access', () => {
  let dir: string;
  let competitor: ReturnType<typeof request.agent>;
  let organizer: ReturnType<typeof request.agent>;
  let organizerCsrf: string;

  async function writeFixture(tournamentId: string, access: 'public' | 'private', published: boolean, ownerId: string) {
    const tournament = createTournament(tournamentId, tournamentId);
    tournament.status = 'completed';
    tournament.completedAt = new Date().toISOString();
    tournament.resultsPublishedAt = published ? new Date().toISOString() : null;
    tournament.metadata = { ownerId, access };
    tournament.participants = [
      { participantId: 'P1', name: 'Player One', bot: { botId: 'bot-one', player: 'A', command: 'node', args: ['secret.js'], env: { SECRET: 'hidden' } }, registeredAt: new Date().toISOString() },
      { participantId: 'P2', name: 'Player Two', bot: { botId: 'bot-two', player: 'A', command: 'python', args: ['secret.py'], env: { TOKEN: 'hidden' } }, registeredAt: new Date().toISOString() },
    ];
    const matchId = 'm-public-results';
    const pairingId = 'P1-v-P2-r1';
    const result = {
      matchId, pairingId, participantA: 'P1', participantB: 'P2', winner: 'A' as const,
      terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 10,
      replayRef: matchId, completedAt: new Date().toISOString(),
      executionProvenance: [{ competitorId: 'private-competitor', botId: 'private-bot', revisionId: 'private-revision', runtimeId: 'cpp', sourceDigest: 'private-digest' }],
      executionDiagnostics: [{ player: 'A' as const, runtimeId: 'cpp' as const, executionMode: 'strategy' as const, exitCode: 1, outputProduced: true, engineAcceptedMove: false }],
    };
    tournament.rounds = [{ roundNumber: 1, pairings: [{ pairingId, roundNumber: 1, participantA: 'P1', participantB: 'P2', status: 'completed', matchId, matchResult: result, startedAt: result.completedAt, completedAt: result.completedAt }] }];
    tournament.standings = computeStandings(tournament.participants, [result], tournament.scoringConfig);
    const replay = {
      matchId, protocolVersion: '0.1.0',
      initialState: { turn: 1, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
      moves: [],
      finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
      winner: 'A', terminationReason: 'goal_reached',
      metadata: { sourceRevisions: result.executionProvenance, executionDiagnostics: result.executionDiagnostics },
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
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-results-'));
    const organizerAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `owner${Date.now()}`, password, 'organizer');
    const competitorAccount = await createControlledAccount(path.join(dir, 'arena.sqlite'), `viewer${Date.now()}`, password, 'competitor');
    await writeFixture('public-published', 'public', true, organizerAccount.id);
    await writeFixture('public-unpublished', 'public', false, organizerAccount.id);
    await writeFixture('private-published', 'private', true, organizerAccount.id);
    await initServer(dir);
    organizer = request.agent(appExport);
    const organizerLogin = await organizer.post('/api/auth/login').send({ username: organizerAccount.username, password });
    organizerCsrf = organizerLogin.body.csrfToken;
    competitor = request.agent(appExport);
    await competitor.post('/api/auth/login').send({ username: competitorAccount.username, password });
  });

  afterEach(async () => {
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('allows competitors to read only published public results and strips Bot metadata', async () => {
    const detail = await competitor.get('/api/tournaments/public-published');
    expect(detail.status).toBe(200);
    expect(detail.body.resultsPublishedAt).toBeTruthy();
    expect(detail.body.participants[0]).toEqual({ participantId: 'P1', name: 'Player One' });
    expect(detail.body).not.toHaveProperty('metadata');
    expect(detail.body).not.toHaveProperty('matchConfig');

    expect((await competitor.get('/api/tournaments/public-published/standings')).status).toBe(200);
    const publicResult = await competitor.get('/api/tournaments/public-published/results/m-public-results');
    expect(publicResult.status).toBe(200);
    expect(publicResult.body).not.toHaveProperty('executionProvenance');
    expect(publicResult.body).not.toHaveProperty('executionDiagnostics');
    const organizerResult = await organizer.get('/api/tournaments/public-published/results/m-public-results');
    expect(organizerResult.status).toBe(200);
    expect(organizerResult.body.executionProvenance).toHaveLength(1);
    expect(organizerResult.body.executionDiagnostics).toHaveLength(1);
    const authoritative = JSON.parse(await fs.readFile(path.join(dir, 'public-published', 'match-m-public-results.json'), 'utf8'));
    expect(authoritative.executionProvenance).toHaveLength(1);
    expect(authoritative.executionDiagnostics).toHaveLength(1);
    const replay = await competitor.get('/api/tournaments/public-published/replays/m-public-results');
    expect(replay.status).toBe(200);
    expect(replay.body.participantIdentities).toMatchObject({
      A: { participantId: 'P1', participantName: 'Player One' },
      B: { participantId: 'P2', participantName: 'Player Two' },
    });
    expect(replay.body.participantIdentities.A).not.toHaveProperty('botId');
    expect(replay.body.participantIdentities.B).not.toHaveProperty('botId');
    expect((await competitor.get('/api/tournaments/public-unpublished')).status).toBe(200);
    expect((await competitor.get('/api/tournaments/public-unpublished/standings')).status).toBe(403);
    expect((await competitor.get('/api/tournaments/private-published')).status).toBe(200);
    expect((await competitor.get('/api/tournaments/private-published/replays/m-public-results')).status).toBe(200);
  });

  it('keeps unpublished results available to the owning organizer only', async () => {
    expect((await organizer.get('/api/tournaments/public-unpublished')).status).toBe(200);
    expect((await organizer.get('/api/tournaments/public-unpublished/standings')).status).toBe(200);
    expect((await organizer.get('/api/tournaments/public-unpublished/replays/m-public-results')).status).toBe(200);
    expect((await organizer.post('/api/tournaments/public-unpublished/publish')).status).toBe(403);
    const published = await organizer.post('/api/tournaments/public-unpublished/publish').set('x-csrf-token', organizerCsrf);
    expect(published.status).toBe(200);
    expect(published.body.resultsPublishedAt).toBeTruthy();
    expect((await competitor.get('/api/tournaments/public-unpublished')).status).toBe(200);
    const before = (await organizer.get('/api/tournaments/private-published')).body.resultsPublishedAt;
    const repeated = await organizer.post('/api/tournaments/private-published/publish').set('x-csrf-token', organizerCsrf);
    expect(repeated.status).toBe(200);
    expect(repeated.body.resultsPublishedAt).toBe(before);
  });
});
