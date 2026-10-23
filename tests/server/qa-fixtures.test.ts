import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { createControlledAccount } from '../../server/admin/role-bootstrap.js';
import { clearExecutorCache } from '../../bot-executor/index.js';
import {
  isQaFixturesEnabled,
  listQaFixtures,
  getQaFixture,
  resetQaFixtures,
  registerQaFixture,
} from '../../server/qa-fixtures.js';
import { createTournament } from '../../tournament/persistence.js';

describe('QA Deterministic Fixtures for Port 3001 UI/UX Testing', () => {
  let testDir: string;
  let organizerAgent: ReturnType<typeof request.agent>;

  const originalPort = process.env.PORT;
  const originalEnvFlag = process.env.ENABLE_QA_FIXTURES;

  beforeEach(async () => {
    clearExecutorCache();
    resetQaFixtures();
    testDir = path.join(os.tmpdir(), `ott-qa-fixtures-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });

    process.env.PORT = '3001';
    process.env.ENABLE_QA_FIXTURES = 'true';
    await initServer(testDir);

    const organizer = await createControlledAccount(path.join(testDir, 'arena.sqlite'), `qa_org_${Date.now()}`, 'password12345678', 'organizer');
    organizerAgent = request.agent(appExport);
    await organizerAgent.post('/api/auth/login').send({ username: organizer.username, password: 'password12345678' });
  });

  afterEach(async () => {
    clearExecutorCache();
    closeServer();
    resetQaFixtures();
    process.env.PORT = originalPort;
    if (originalEnvFlag !== undefined) {
      process.env.ENABLE_QA_FIXTURES = originalEnvFlag;
    } else {
      delete process.env.ENABLE_QA_FIXTURES;
    }
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('does not register retired QA tournament fixtures', () => {
    expect(listQaFixtures()).toHaveLength(0);
    expect(getQaFixture('qa-multistage-8')).toBeUndefined();
    expect(getQaFixture('qa-multistage-16')).toBeUndefined();
    expect(getQaFixture('qa-multistage-32')).toBeUndefined();
    expect(getQaFixture('qa-knockout-32')).toBeUndefined();
  });

  it('enforces fixture ownership across organizer listing, detail and mutation endpoints', async () => {
    const other = await createControlledAccount(path.join(testDir, 'arena.sqlite'), `qa_other_${Date.now()}`, 'password12345678', 'organizer');
    const otherAgent = request.agent(appExport);
    const otherLogin = await otherAgent.post('/api/auth/login').send({ username: other.username, password: 'password12345678' });
    const otherCsrf = otherLogin.body.csrfToken;
    const fixture = createTournament('qa-owned-http', 'Owned HTTP fixture', 'single_round_robin');
    fixture.metadata = { ownerId: (await organizerAgent.get('/api/auth/me')).body.user.id, access: 'private' };
    fixture.status = 'completed';
    const completedAt = new Date().toISOString();
    fixture.rounds = [{ roundNumber: 1, pairings: [{
      pairingId: 'qa-pairing', roundNumber: 1, participantA: 'A', participantB: 'B', status: 'failed', matchId: 'qa-match',
      matchResult: { matchId: 'qa-match', pairingId: 'qa-pairing', participantA: 'A', participantB: 'B', winner: 'A', terminationReason: 'goal_reached', turnCount: 1, durationMs: 1, replayRef: 'qa-match', completedAt },
    }, {
      pairingId: 'qa-tiebreaker', roundNumber: 1, participantA: 'A', participantB: 'B', status: 'pending_tiebreaker', tiebreakerStatus: 'pending', matchId: 'qa-tiebreaker-match',
    }, {
      pairingId: 'qa-completed', roundNumber: 1, participantA: 'A', participantB: 'B', status: 'completed', matchId: 'qa-completed-match',
      matchResult: { matchId: 'qa-completed-match', pairingId: 'qa-completed', participantA: 'A', participantB: 'B', winner: 'A', terminationReason: 'goal_reached', turnCount: 1, durationMs: 1, replayRef: 'qa-completed-match', completedAt },
    }] }];
    registerQaFixture(fixture);

    expect((await organizerAgent.get('/api/tournaments')).body.map((item: { tournamentId: string }) => item.tournamentId)).toContain('qa-owned-http');
    expect((await otherAgent.get('/api/tournaments')).body.map((item: { tournamentId: string }) => item.tournamentId)).not.toContain('qa-owned-http');
    expect((await organizerAgent.get('/api/tournaments/qa-owned-http')).status).toBe(200);
    expect((await otherAgent.get('/api/tournaments/qa-owned-http')).status).toBe(404);
    expect((await otherAgent.post('/api/tournaments/qa-owned-http/action').set('x-csrf-token', otherCsrf).send({ action: 'invalid' })).status).toBe(404);
    expect((await otherAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/retry').set('x-csrf-token', otherCsrf)).status).toBe(404);
    expect((await otherAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/requeue').set('x-csrf-token', otherCsrf)).status).toBe(404);
    expect((await otherAgent.post('/api/tournaments/qa-owned-http/pairings/qa-completed/rematch').set('x-csrf-token', otherCsrf)).status).toBe(404);
    expect((await otherAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/resolve-tiebreaker').set('x-csrf-token', otherCsrf).send({ winner: 'A' })).status).toBe(404);
    expect((await otherAgent.get('/api/tournaments/qa-owned-http/results/qa-match')).status).toBe(404);

    const ownerCsrf = (await organizerAgent.get('/api/auth/me')).body.csrfToken;
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/action').set('x-csrf-token', ownerCsrf).send({ action: 'invalid' })).status).toBe(400);
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/requeue')).status).toBe(403);
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-completed/rematch')).status).toBe(403);
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/retry').set('x-csrf-token', ownerCsrf)).status).toBe(200);
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-pairing/requeue').set('x-csrf-token', ownerCsrf)).status).toBe(409);
    const blockedRematch = await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-completed/rematch').set('x-csrf-token', ownerCsrf);
    expect(blockedRematch.status).toBe(409);
    expect(blockedRematch.body.error).toContain('blocked');
    expect((await organizerAgent.post('/api/tournaments/qa-owned-http/pairings/qa-tiebreaker/resolve-tiebreaker').set('x-csrf-token', ownerCsrf).send({ winner: 'A' })).status).toBe(200);
    expect((await organizerAgent.get('/api/tournaments/qa-owned-http/results/qa-match')).status).toBe(200);
    expect(otherLogin.status).toBe(200);
  });

});
