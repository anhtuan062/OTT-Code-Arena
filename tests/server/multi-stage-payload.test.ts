import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { createMultiStageTournament } from '../../tournament/multi-stage.js';
import { createTournament } from '../../tournament/persistence.js';
import type { TournamentParticipant } from '../../tournament/types.js';

describe('multi-stage API payload projections', () => {
  let dir: string;
  let ownerAgent: ReturnType<typeof request.agent>;
  let ownerId: string;
  let competitorAgent: ReturnType<typeof request.agent>;
  let otherOrganizerAgent: ReturnType<typeof request.agent>;
  const previousFlag = process.env.ENABLE_MULTI_STAGE;

  function participants(count: number): TournamentParticipant[] {
    return Array.from({ length: count }, (_, index) => ({
      participantId: `p-${index + 1}`,
      name: `Bot ${index + 1}`,
      bot: { botId: `bot-${index + 1}`, player: 'A' as const, command: 'node', args: [] },
      registeredAt: new Date(0).toISOString(),
    }));
  }

  async function writeTournament(tournament: unknown, tournamentId: string) {
    const tournamentDir = path.join(dir, tournamentId);
    await fs.mkdir(tournamentDir, { recursive: true });
    await fs.writeFile(path.join(tournamentDir, 'tournament.json'), JSON.stringify(tournament), 'utf8');
  }

  async function writeMultiStageFixture(tournamentId: string, count = 256) {
    const tournament = createMultiStageTournament({
      tournamentId,
      name: `Payload ${count}`,
      participants: participants(count),
      metadata: { ownerId },
    });
    tournament.status = 'running';
    tournament.startedAt = new Date().toISOString();
    tournament.resultsPublishedAt = null;
    await writeTournament(tournament, tournamentId);
    return tournament;
  }

  beforeEach(async () => {
    process.env.ENABLE_MULTI_STAGE = 'true';
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-multi-stage-payload-'));
    await initServer(dir);
    const owner = await createControlledAccount(path.join(dir, 'arena.sqlite'), `payloadowner${Date.now()}`, 'password12345678', 'organizer');
    ownerId = owner.id;
    ownerAgent = request.agent(appExport);
    const ownerLogin = await ownerAgent.post('/api/auth/login').send({ username: owner.username, password: 'password12345678' });
    expect(ownerLogin.status).toBe(200);

    const otherOrganizer = await createControlledAccount(path.join(dir, 'arena.sqlite'), `payloadother${Date.now()}`, 'password12345678', 'organizer');
    otherOrganizerAgent = request.agent(appExport);
    const otherLogin = await otherOrganizerAgent.post('/api/auth/login').send({ username: otherOrganizer.username, password: 'password12345678' });
    expect(otherLogin.status).toBe(200);

    competitorAgent = request.agent(appExport);
    const competitor = await competitorAgent.post('/api/auth/register').send({ username: `payloadcompetitor${Date.now()}`, password: 'password12345678' });
    expect(competitor.status).toBe(201);
  });

  afterEach(async () => {
    closeServer();
    if (previousFlag === undefined) delete process.env.ENABLE_MULTI_STAGE;
    else process.env.ENABLE_MULTI_STAGE = previousFlag;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns lightweight progress without pairings', async () => {
    const tournament = await writeMultiStageFixture('progress-256');

    const response = await ownerAgent.get('/api/tournaments/progress-256/progress');
    expect(response.status).toBe(200);
    expect(response.body.progress).toMatchObject({ total: 383, completed: 0, inProgress: 0, pending: 383, failed: 0, pendingTiebreaker: 0 });
    expect(response.body.stages).toHaveLength(3);
    expect(JSON.stringify(response.body)).not.toContain('pairings');
    expect(response.body.stages[0].regions).toHaveLength(4);
    expect(tournament.stages).toHaveLength(3);
  });

  it('reports in-progress pairings separately from pending pairings', async () => {
    const tournament = await writeMultiStageFixture('progress-active');
    const pairings = tournament.stages?.[0]?.regions?.[0]?.rounds?.[0]?.pairings ?? [];
    expect(pairings.length).toBeGreaterThan(1);
    pairings[0].status = 'in_progress';

    await writeTournament(tournament, 'progress-active');
    const response = await ownerAgent.get('/api/tournaments/progress-active/progress');

    expect(response.status).toBe(200);
    expect(response.body.progress).toMatchObject({ inProgress: 1, pending: 382 });
    expect(response.body.stages[0].progress).toMatchObject({ inProgress: 1, pending: 127 });
  });

  it('keeps new endpoints tenant-isolated and blocks draft competitors', async () => {
    const tournament = createMultiStageTournament({
      tournamentId: 'access-256', name: 'Access 256', participants: participants(256), metadata: { ownerId },
    });
    await writeTournament(tournament, 'access-256');

    expect((await otherOrganizerAgent.get('/api/tournaments/access-256/progress')).status).toBe(404);
    expect((await otherOrganizerAgent.get('/api/tournaments/access-256/pairings')).status).toBe(404);
    expect((await competitorAgent.get('/api/tournaments/access-256/progress')).status).toBe(403);
    expect((await competitorAgent.get('/api/tournaments/access-256/pairings')).status).toBe(403);
  });

  it('paginates pairings and caps page size', async () => {
    await writeMultiStageFixture('pairings-256');

    const response = await ownerAgent.get('/api/tournaments/pairings-256/pairings')
      .query({ stageId: 'stage-preliminary', regionId: 'region-1', page: 2, pageSize: 5 });
    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ page: 2, pageSize: 5, totalItems: 32, totalPages: 7 });
    expect(response.body.pairings).toHaveLength(5);
    expect(response.body.pairings.every((pairing: any) => pairing.regionId === 'region-1')).toBe(true);

    const tooLarge = await ownerAgent.get('/api/tournaments/pairings-256/pairings').query({ pageSize: 101 });
    expect(tooLarge.status).toBe(400);

    const malformed = await ownerAgent.get('/api/tournaments/pairings-256/pairings').query({ page: 0 });
    expect(malformed.status).toBe(400);
  });

  it('excludes bye pairings before paginating when requested by the schedule view', async () => {
    const tournament = await writeMultiStageFixture('pairings-with-byes', 256);
    const pairings = tournament.stages?.[0]?.regions?.[0]?.rounds?.flatMap(round => round.pairings) ?? [];
    pairings[0]!.participantB = null;
    pairings[0]!.status = 'bye';
    pairings[1]!.participantB = null;
    pairings[1]!.status = 'bye';
    await writeTournament(tournament, 'pairings-with-byes');

    const response = await ownerAgent.get('/api/tournaments/pairings-with-byes/pairings')
      .query({ stageId: 'stage-preliminary', regionId: 'region-1', page: 1, pageSize: 10, excludeByes: 'true' });

    expect(response.status).toBe(200);
    expect(response.body.filters.excludeByes).toBe(true);
    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 10, totalItems: 30, totalPages: 3 });
    expect(response.body.pairings).toHaveLength(10);
    expect(response.body.pairings.every((pairing: any) => pairing.participantB !== null && pairing.status !== 'bye')).toBe(true);

    const progress = await ownerAgent.get('/api/tournaments/pairings-with-byes/progress');
    expect(progress.status).toBe(200);
    expect(progress.body.progress.total).toBe(381);
  });

  it('keeps unpublished match results hidden from competitors', async () => {
    const tournament = await writeMultiStageFixture('redaction-256');
    const pairing = tournament.stages?.[0]?.regions?.[0]?.rounds?.[0]?.pairings?.find(item => item.participantB !== null);
    expect(pairing).toBeDefined();
    pairing!.status = 'completed';
    pairing!.matchResult = {
      matchId: 'unpublished-match', pairingId: pairing!.pairingId, participantA: pairing!.participantA,
      participantB: pairing!.participantB!, winner: 'A', terminationReason: 'goal_reached', turnCount: 1,
      durationMs: 1, replayRef: 'unpublished-match', completedAt: new Date().toISOString(),
    } as any;
    pairing!.matchId = 'unpublished-match';
    const group = tournament.stages?.[1]?.groups?.[0];
    if (group) group.standings = [{ participantId: 'p-1', participantName: 'Bot 1', matchesPlayed: 1, wins: 1, draws: 0, losses: 0, forfeits: 0, points: 3, tiebreakHeadToHead: {} }];
    await writeTournament(tournament, 'redaction-256');

    const response = await competitorAgent.get('/api/tournaments/redaction-256/pairings')
      .query({ page: 1, pageSize: 100 });
    expect(response.status).toBe(200);
    const hidden = response.body.pairings.find((item: any) => item.pairingId === pairing!.pairingId);
    expect(hidden).toBeDefined();
    expect(hidden.matchResult).toBeNull();

    const progress = await competitorAgent.get('/api/tournaments/redaction-256/progress');
    expect(progress.status).toBe(200);
    expect(progress.body.stages[1].groups[0].standings).toEqual([]);
  });

  it('keeps legacy rounds by default and supports an explicit compact view', async () => {
    const tournament = createTournament('legacy-payload', 'Legacy Payload');
    tournament.metadata = { ownerId };
    tournament.status = 'running';
    tournament.rounds = [{
      roundNumber: 1,
      pairings: [{
        pairingId: 'legacy-pairing', roundNumber: 1, participantA: 'A', participantB: 'B', status: 'scheduled',
        matchId: null, matchResult: null, startedAt: null, completedAt: null,
      }],
    }];
    await writeTournament(tournament, 'legacy-payload');

    const legacy = await ownerAgent.get('/api/tournaments/legacy-payload');
    expect(legacy.status).toBe(200);
    expect(legacy.body.rounds).toHaveLength(1);

    const compact = await ownerAgent.get('/api/tournaments/legacy-payload').query({ includeRounds: false });
    expect(compact.status).toBe(200);
    expect(compact.body.rounds).toEqual([]);

    const progress = await ownerAgent.get('/api/tournaments/legacy-payload/progress');
    expect(progress.status).toBe(200);
    expect(progress.body.isLegacy).toBe(true);
    expect(progress.body.progress.total).toBe(1);
  });

  it('reduces large responses with compact projections at 256, 1024 and 4096 bots', async () => {
    const measurements: Array<Record<string, number>> = [];
    for (const count of [256, 1024, 4096]) {
      const id = `size-${count}`;
      await writeMultiStageFixture(id, count);

      const fullDetail = await ownerAgent.get(`/api/tournaments/${id}`);
      const compactDetail = await ownerAgent.get(`/api/tournaments/${id}`).query({ includeRounds: false });
      const fullStages = await ownerAgent.get(`/api/tournaments/${id}/stages`);
      const compactStages = await ownerAgent.get(`/api/tournaments/${id}/stages`).query({ compact: true });
      expect(fullDetail.status).toBe(200);
      expect(compactDetail.status).toBe(200);
      expect(fullStages.status).toBe(200);
      expect(compactStages.status).toBe(200);

      const row = {
        count,
        detailBefore: Buffer.byteLength(JSON.stringify(fullDetail.body)),
        detailAfter: Buffer.byteLength(JSON.stringify(compactDetail.body)),
        stagesBefore: Buffer.byteLength(JSON.stringify(fullStages.body)),
        stagesAfter: Buffer.byteLength(JSON.stringify(compactStages.body)),
      };
      measurements.push(row);
      expect(row.detailAfter).toBeLessThan(row.detailBefore);
      expect(row.stagesAfter).toBeLessThan(row.stagesBefore);
    }
    console.log(`MULTI_STAGE_PAYLOAD_MEASUREMENTS ${JSON.stringify(measurements)}`);
  }, 120_000);
});
