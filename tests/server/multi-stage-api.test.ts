import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { clearExecutorCache } from '../../bot-executor/index.js';
import type { Tournament } from '../../tournament/types.js';

describe('Multi-Stage Tournament API (Phase 3A)', () => {
  let testDir: string;
  let organizerAgent: ReturnType<typeof request.agent>;
  let organizerCsrf: string;
  let organizerId: string;

  let otherOrganizerAgent: ReturnType<typeof request.agent>;
  let otherOrganizerCsrf: string;
  let otherOrganizerId: string;

  let competitorAgent: ReturnType<typeof request.agent>;
  let competitorCsrf: string;
  let competitorId: string;

  const originalEnvFlag = process.env.ENABLE_MULTI_STAGE;

  beforeEach(async () => {
    clearExecutorCache();
    testDir = path.join(os.tmpdir(), `ott-multi-stage-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });

    // Enable multi-stage feature flag by default for tests that exercise multi-stage
    process.env.ENABLE_MULTI_STAGE = 'true';
    await initServer(testDir);

    // Setup organizer 1
    const organizer = await createControlledAccount(path.join(testDir, 'arena.sqlite'), `org1_${Date.now()}`, 'password12345678', 'organizer');
    organizerId = organizer.id;
    organizerAgent = request.agent(appExport);
    const orgLogin = await organizerAgent.post('/api/auth/login').send({ username: organizer.username, password: 'password12345678' });
    organizerCsrf = orgLogin.body.csrfToken;

    // Setup organizer 2
    const otherOrganizer = await createControlledAccount(path.join(testDir, 'arena.sqlite'), `org2_${Date.now()}`, 'password12345678', 'organizer');
    otherOrganizerId = otherOrganizer.id;
    otherOrganizerAgent = request.agent(appExport);
    const otherLogin = await otherOrganizerAgent.post('/api/auth/login').send({ username: otherOrganizer.username, password: 'password12345678' });
    otherOrganizerCsrf = otherLogin.body.csrfToken;

    // Setup competitor
    competitorAgent = request.agent(appExport);
    const compAuth = await competitorAgent.post('/api/auth/register').send({ username: `comp_${Date.now()}`, password: 'password12345678' });
    competitorCsrf = compAuth.body.csrfToken;
    competitorId = compAuth.body.user.id;
  });

  afterEach(async () => {
    clearExecutorCache();
    closeServer();
    if (originalEnvFlag !== undefined) {
      process.env.ENABLE_MULTI_STAGE = originalEnvFlag;
    } else {
      delete process.env.ENABLE_MULTI_STAGE;
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Feature Flag Gating', () => {
    it('rejects multi_stage format with 400 when feature flag is disabled', async () => {
      // Re-init server with ENABLE_MULTI_STAGE=false
      closeServer();
      process.env.ENABLE_MULTI_STAGE = 'false';
      await initServer(testDir);

      const res = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({
          name: 'Flag Off Multi-Stage',
          format: 'multi_stage',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('disabled by feature flag');
    });

    it('does not create a legacy format through the new tournament API', async () => {
      closeServer();
      process.env.ENABLE_MULTI_STAGE = 'false';
      await initServer(testDir);

      const res = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({
          name: 'Legacy Tournament',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('disabled by feature flag');
    });

    it('creates multi_stage tournament when feature flag is enabled', async () => {
      const res = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({
          name: 'Flag On Multi-Stage',
          format: 'multi_stage',
        });

      expect(res.status).toBe(201);
      expect(res.body.format).toBe('multi_stage');
      expect(res.body.matchConfig.bestOf).toBe(3);
      expect(res.body.configurationVersion).toBe(2);
      expect(res.body.metadata.ownerId).toBe(organizerId);

      const legacyAttempt = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Legacy API Attempt', format: 'single_round_robin', matchConfig: { bestOf: 1 } });
      expect(legacyAttempt.status).toBe(400);
    });
  });

  describe('Phase 2 Settings API', () => {
    it('supports partial settings updates and rejects non-owners', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Settings API', format: 'multi_stage' });
      const id = created.body.tournamentId;
      const update = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({
        description: 'Updated intro',
        schedule: { visibleAt: '2026-11-01T00:00:00.000Z', registrationClosesAt: '2026-12-01T00:00:00.000Z' },
        matchConfig: { maxTurns: 300 },
      });
      expect(update.status).toBe(200);
      expect(update.body.description).toBe('Updated intro');
      expect(update.body.matchConfig.maxTurns).toBe(300);
      expect(update.body.matchConfig.turnTimeoutMs).toBe(5000);
      expect(update.body.schedule.visibleAt).toBe('2026-11-01T00:00:00.000Z');

      const fixedFormat = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({ format: 'single_round_robin' });
      expect([400, 409]).toContain(fixedFormat.status);
      const fixedSeries = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({ matchConfig: { bestOf: 1 } });
      expect([400, 409]).toContain(fixedSeries.status);

      const forbidden = await otherOrganizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', otherOrganizerCsrf).send({ description: 'Nope' });
      expect(forbidden.status).toBe(404);
    });

    it('validates unsupported rules and locks technical settings after registration opens', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Locked Settings' });
      const id = created.body.tournamentId;
      const invalid = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({ rulesConfig: { rulesetId: 'future-rule' } });
      expect(invalid.status).toBe(400);

      const opened = await organizerAgent.post(`/api/tournaments/${id}/action`).set('x-csrf-token', organizerCsrf).send({ action: 'open_registration' });
      expect(opened.status).toBe(200);
      expect(opened.body.rulesetSnapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);

      const locked = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({ format: 'multi_stage', matchConfig: { bestOf: 2 } });
      expect(locked.status).toBe(409);
      const extension = await organizerAgent.patch(`/api/tournaments/${id}`).set('x-csrf-token', organizerCsrf).send({ schedule: { registrationClosesAt: '2027-01-01T00:00:00.000Z' } });
      expect(extension.status).toBe(200);
    });
  });

  describe('Read APIs & Frontend Compatibility', () => {
    it('hides a tournament before visibleAt but keeps owner management available', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Scheduled Visibility' });
      const tournamentId = created.body.tournamentId;
      const future = new Date(Date.now() + 60_000).toISOString();
      const patched = await organizerAgent.patch(`/api/tournaments/${tournamentId}`).set('x-csrf-token', organizerCsrf).send({
        schedule: { visibleAt: future, registrationOpensAt: future },
      });
      expect(patched.status).toBe(200);
      expect((await competitorAgent.get('/api/tournaments/discoverable')).body.some((item: { tournamentId: string }) => item.tournamentId === tournamentId)).toBe(false);
      expect((await competitorAgent.get(`/api/tournaments/${tournamentId}`)).status).toBe(403);
      expect((await organizerAgent.get(`/api/tournaments/${tournamentId}`)).status).toBe(200);
    });

    it('exposes a visible draft as public information without opening registration', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Visible Draft' });
      const tournamentId = created.body.tournamentId;
      const patched = await organizerAgent.patch(`/api/tournaments/${tournamentId}`).set('x-csrf-token', organizerCsrf).send({
        schedule: { visibleAt: new Date(Date.now() - 1_000).toISOString() },
      });
      expect(patched.status).toBe(200);

      const discovery = await competitorAgent.get('/api/tournaments/discoverable');
      expect(discovery.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ tournamentId, status: 'draft' }),
      ]));
      const detail = await competitorAgent.get(`/api/tournaments/${tournamentId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('draft');
      expect((await competitorAgent.post(`/api/tournaments/${tournamentId}/participation-requests`).set('x-csrf-token', competitorCsrf).send({})).status).not.toBe(201);
    });

    it('keeps a draft without visibleAt private', async () => {
      const created = await organizerAgent.post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Unscheduled Draft' });
      expect(created.status).toBe(201);
      const tournamentId = created.body.tournamentId;

      const response = await competitorAgent.get('/api/tournaments/discoverable');

      expect(response.status).toBe(200);
      expect(response.body.some((item: { tournamentId: string }) => item.tournamentId === tournamentId)).toBe(false);

      const detail = await competitorAgent.get(`/api/tournaments/${tournamentId}`);
      expect(detail.status).toBe(403);
    });

    it('catches up scheduled open and close on API reads without a browser refresh', async () => {
      const created = await organizerAgent.post('/api/tournaments').set('x-csrf-token', organizerCsrf).send({ name: 'Scheduled Transition' });
      const tournamentId = created.body.tournamentId;
      const now = Date.now();
      const patched = await organizerAgent.patch(`/api/tournaments/${tournamentId}`).set('x-csrf-token', organizerCsrf).send({
        schedule: {
          visibleAt: new Date(now - 2_000).toISOString(),
          registrationOpensAt: new Date(now - 1_000).toISOString(),
          registrationClosesAt: new Date(now - 500).toISOString(),
        },
      });
      expect(patched.status).toBe(200);
      const detail = await organizerAgent.get(`/api/tournaments/${tournamentId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.status).toBe('registration_closed');
      expect(detail.body.registrationClosedReason).toBe('scheduled');
      expect(detail.body.rulesetSnapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns 404 for stages of non-existent tournament', async () => {
      const res = await organizerAgent.get('/api/tournaments/non-existent-id/stages');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tournament not found');
    });

    it('isolates stages lookup so non-owning organizer gets 404', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Private Multi-Stage', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await otherOrganizerAgent.get(`/api/tournaments/${tournamentId}/stages`);
      expect(res.status).toBe(404);
    });

    it('blocks competitors from viewing stages of a draft tournament (403)', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Draft Tournament', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await competitorAgent.get(`/api/tournaments/${tournamentId}/stages`);
      expect(res.status).toBe(403);
    });

    it('exposes stages and progress via GET /api/tournaments/:id/stages for owner', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Stages Read Test', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await organizerAgent.get(`/api/tournaments/${tournamentId}/stages`);
      expect(res.status).toBe(200);
      expect(res.body.tournamentId).toBe(tournamentId);
      expect(res.body.format).toBe('multi_stage');
      expect(res.body.isLegacy).toBe(false);
      expect(res.body.progress).toBeDefined();
      expect(res.body.progress.totalStages).toBe(0); // Before schedule generation
    });

    it('provides synthesized rounds in GET /api/tournaments/:id for frontend compatibility', async () => {
      // Create and populate a tournament with stages directly to verify synthesis
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Synthesis Test', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      // Directly verify that GET /api/tournaments/:id returns rounds array
      const res = await organizerAgent.get(`/api/tournaments/${tournamentId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rounds)).toBe(true);
    });
  });

  describe('Lifecycle State & Authorization Checks', () => {
    it('prevents non-owners from performing actions (404)', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Auth Check', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await otherOrganizerAgent
        .post(`/api/tournaments/${tournamentId}/action`)
        .set('x-csrf-token', otherOrganizerCsrf)
        .send({ action: 'start' });

      expect(res.status).toBe(404);
    });

    it('prevents competitors from performing organizer actions (403)', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Competitor Action Block', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await competitorAgent
        .post(`/api/tournaments/${tournamentId}/action`)
        .set('x-csrf-token', competitorCsrf)
        .send({ action: 'start' });

      expect(res.status).toBe(403);
    });

    it('rejects start action with 409 if tournament is in draft state', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Draft Start Test', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/action`)
        .set('x-csrf-token', organizerCsrf)
        .send({ action: 'start' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot start tournament with status draft');
    });

    it('rejects resume action with 409 if tournament is not running', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Resume Idle Test', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/action`)
        .set('x-csrf-token', organizerCsrf)
        .send({ action: 'resume' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot resume tournament with status draft');
    });
  });

  describe('Tiebreaker Resolution API & Audit Trail', () => {
    it('validates winner parameter (rejects values other than A or B)', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Tiebreaker Validation', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/p-1/resolve-tiebreaker`)
        .set('x-csrf-token', organizerCsrf)
        .send({ winner: 'INVALID' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Winner must be either 'A' or 'B'");
    });

    it('validates reason parameter length (max 500 chars)', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Tiebreaker Reason Validation', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const res = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/p-1/resolve-tiebreaker`)
        .set('x-csrf-token', organizerCsrf)
        .send({ winner: 'A', reason: 'x'.repeat(501) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Reason must be a string of at most 500 characters');
    });

    it('blocks competitors and non-owners from resolving tiebreakers', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Tiebreaker Auth Block', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      // Competitor
      const compRes = await competitorAgent
        .post(`/api/tournaments/${tournamentId}/pairings/p-1/resolve-tiebreaker`)
        .set('x-csrf-token', competitorCsrf)
        .send({ winner: 'A' });
      expect(compRes.status).toBe(403);

      // Non-owner organizer
      const otherRes = await otherOrganizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/p-1/resolve-tiebreaker`)
        .set('x-csrf-token', otherOrganizerCsrf)
        .send({ winner: 'A' });
      expect(otherRes.status).toBe(404);
    });

    it('resolves tiebreaker via dedicated endpoint, maintains idempotency and records audit', async () => {
      // Create a mock tournament file on disk with a pairing in pending_tiebreaker state
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Tiebreaker Lifecycle', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      // Modify the tournament on disk to inject a pending_tiebreaker pairing
      const tournamentFilePath = path.join(testDir, tournamentId, 'tournament.json');
      const rawContent = await fs.readFile(tournamentFilePath, 'utf8');
      const tournamentData: Tournament = JSON.parse(rawContent);

      const pairingId = 'pairing-test-tb';
      tournamentData.status = 'running';
      tournamentData.stages = [
        {
          stageId: 'stage-knockout',
          stageType: 'knockout',
          name: 'Knockout Finals',
          order: 1,
          status: 'in_progress',
          rounds: [
            {
              roundNumber: 1,
              pairings: [
                {
                  pairingId,
                  roundNumber: 1,
                  participantA: 'bot-1',
                  participantB: 'bot-2',
                  status: 'pending_tiebreaker',
                  matchId: 'match-tb',
                  tiebreakerStatus: 'pending',
                  matchResult: {
                    matchId: 'match-tb',
                    pairingId,
                    winner: 'draw',
                    terminationReason: 'draw',
                    completedAt: new Date().toISOString(),
                    startedAt: new Date().toISOString(),
                    durationMs: 100,
                  },
                },
              ],
            },
          ],
          advancement: {
            ruleType: 'knockout_champion',
            advancingCount: 1,
            advancingParticipantIds: [],
            isComplete: false,
          },
        },
      ];
      await fs.writeFile(tournamentFilePath, JSON.stringify(tournamentData, null, 2), 'utf8');

      // 1. Resolve tiebreaker as owner
      const res1 = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/${pairingId}/resolve-tiebreaker`)
        .set('x-csrf-token', organizerCsrf)
        .send({ winner: 'A', reason: 'Better micro-decisions in overtime' });

      expect(res1.status).toBe(200);
      expect(res1.body.message).toContain('Tiebreaker resolved successfully');
      expect(res1.body.winner).toBe('A');
      expect(res1.body.pairing.status).toBe('completed');
      expect(res1.body.pairing.tiebreakerStatus).toBe('resolved');

      // 2. Verify audit history in stages endpoint
      const stagesRes = await organizerAgent.get(`/api/tournaments/${tournamentId}/stages`);
      expect(stagesRes.status).toBe(200);
      expect(stagesRes.body.audit).toBeDefined();
      expect(stagesRes.body.audit.length).toBe(1);
      expect(stagesRes.body.audit[0].pairingId).toBe(pairingId);
      expect(stagesRes.body.audit[0].winner).toBe('A');
      expect(stagesRes.body.audit[0].resolvedBy).toBe(organizerId);
      expect(stagesRes.body.audit[0].reason).toBe('Better micro-decisions in overtime');

      // 3. Idempotency: resolving again with identical winner succeeds
      const res2 = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/${pairingId}/resolve-tiebreaker`)
        .set('x-csrf-token', organizerCsrf)
        .send({ winner: 'A', reason: 'Better micro-decisions in overtime' });

      expect(res2.status).toBe(200);

      // 4. Conflicting resolution: resolving with different winner is rejected with 409
      const resConflict = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/pairings/${pairingId}/resolve-tiebreaker`)
        .set('x-csrf-token', organizerCsrf)
        .send({ winner: 'B', reason: 'Different decision' });

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.error).toContain('already resolved with conflicting winner');
    });

    it('also supports resolve_tiebreaker via action dispatcher', async () => {
      const created = await organizerAgent
        .post('/api/tournaments')
        .set('x-csrf-token', organizerCsrf)
        .send({ name: 'Action Tiebreaker', format: 'multi_stage' });
      const tournamentId = created.body.tournamentId;

      const tournamentFilePath = path.join(testDir, tournamentId, 'tournament.json');
      const rawContent = await fs.readFile(tournamentFilePath, 'utf8');
      const tournamentData: Tournament = JSON.parse(rawContent);

      const pairingId = 'pairing-action-tb';
      tournamentData.status = 'running';
      tournamentData.stages = [
        {
          stageId: 'stage-ko',
          stageType: 'knockout',
          name: 'Knockout',
          order: 1,
          status: 'in_progress',
          rounds: [
            {
              roundNumber: 1,
              pairings: [
                {
                  pairingId,
                  roundNumber: 1,
                  participantA: 'bot-1',
                  participantB: 'bot-2',
                  status: 'pending_tiebreaker',
                  matchId: 'match-action-tb',
                  tiebreakerStatus: 'pending',
                  matchResult: {
                    matchId: 'match-action-tb',
                    pairingId,
                    winner: 'draw',
                    terminationReason: 'draw',
                    completedAt: new Date().toISOString(),
                    startedAt: new Date().toISOString(),
                    durationMs: 100,
                  },
                },
              ],
            },
          ],
          advancement: {
            ruleType: 'knockout_champion',
            advancingCount: 1,
            advancingParticipantIds: [],
            isComplete: false,
          },
        },
      ];
      await fs.writeFile(tournamentFilePath, JSON.stringify(tournamentData, null, 2), 'utf8');

      const actionRes = await organizerAgent
        .post(`/api/tournaments/${tournamentId}/action`)
        .set('x-csrf-token', organizerCsrf)
        .send({
          action: 'resolve_tiebreaker',
          pairingId,
          winner: 'B',
          reason: 'Head-to-head score criteria',
        });

      expect(actionRes.status).toBe(200);

      const updated = await organizerAgent.get(`/api/tournaments/${tournamentId}`);
      expect(updated.status).toBe(200);
      const pairing = updated.body.stages[0].rounds[0].pairings[0];
      expect(pairing.status).toBe('completed');
      expect(pairing.matchResult.winner).toBe('B');
    });
  });
});
