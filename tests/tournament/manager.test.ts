/**
 * Tournament Manager - Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  createMockTournamentManager,
} from '@tournament/manager.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { MockMatchExecutor } from '@tournament/executor.js';
import type { MatchExecutor } from '@tournament/executor.js';
import { ExecutionCancelledError } from '@bot-executor/types.js';
import type { Tournament, TournamentBot, TournamentParticipant } from '@tournament/types.js';
import type { MatchResult, MatchReplay } from '@match-runner/types.js';

describe('Tournament Manager', () => {
  let testDir: string;
  let repository: FileTournamentRepository;
  let mockExecutor: MockMatchExecutor;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ott-manager-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    repository = new FileTournamentRepository({ baseDir: testDir, indent: 2 });
    await repository.initialize();
    mockExecutor = new MockMatchExecutor();
  });

  afterEach(async () => {
    repository.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  const createTestBot = (id: string): TournamentBot => ({
    botId: id,
    command: 'node',
    args: ['-e', `
      const fs = require('fs');
      const input = fs.readFileSync(0, 'utf-8');
      const req = JSON.parse(input);
      const move = req.legal_moves[0];
      console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
    `],
  });

  const createTestTournament = async (manager: TournamentManager, id: string, name: string): Promise<Tournament> => {
    const result = await manager.createTournament(id, name);
    expect(result.success).toBe(true);
    return result.data!;
  };

  const registerParticipants = async (manager: TournamentManager, tournamentId: string, count: number): Promise<Tournament> => {
    let tournament: Tournament | undefined;
    for (let i = 1; i <= count; i++) {
      const result = await manager.registerParticipant(tournamentId, `P${i}`, `Player ${i}`, createTestBot(`bot-${i}`));
      expect(result.success).toBe(true);
      tournament = result.data!;
    }
    return tournament!;
  };

  const createMockMatchResult = (matchId: string, winner: 'A' | 'B' | 'draw' = 'A', terminationReason = 'goal_reached'): MatchResult => ({
    matchId,
    protocolVersion: '0.1.0',
    status: 'finished',
    winner,
    terminationReason: terminationReason as any,
    turnCount: 10,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 1000,
    playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
    playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
    finalState: {
      turn: 10,
      currentPlayer: 'A',
      status: 'finished',
      winner: terminationReason.startsWith('bot_') ? null : winner,
      winReason: terminationReason,
      pieces: [],
      lastMove: null,
      positionHistory: [],
    },
    turnLog: [],
    initialState: {
      turn: 1,
      currentPlayer: 'A',
      status: 'in_progress',
      winner: null,
      winReason: null,
      pieces: [],
      lastMove: null,
      positionHistory: [],
    },
  });

  describe('Tournament Lifecycle', () => {
    it('should create tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      const result = await manager.createTournament('tourney-1', 'Test Tournament');
      expect(result.success).toBe(true);
      expect(result.data?.tournamentId).toBe('tourney-1');
      expect(result.data?.status).toBe('draft');
    });

    it('should not create duplicate tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await manager.createTournament('tourney-1', 'Test Tournament');
      const result = await manager.createTournament('tourney-1', 'Test Tournament 2');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should register participants in draft', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      const result = await manager.registerParticipant('tourney-1', 'P1', 'Player 1', createTestBot('bot-1'));

      expect(result.success).toBe(true);
      expect(result.data?.participants).toHaveLength(1);
    });

    it('should not register in running tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      const tournament = await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');
      await manager.startTournament('tourney-1');

      const result = await manager.registerParticipant('tourney-1', 'P3', 'Player 3', createTestBot('bot-3'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot register');
    });

    it('should open registration', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      const result = await manager.openRegistration('tourney-1');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('registration_open');
      expect(result.data?.registrationOpenedAt).toBeDefined();
    });

    it('should close registration and generate schedule', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 4);
      await manager.openRegistration('tourney-1');

      const scheduleResult = await manager.generateSchedule('tourney-1');
      expect(scheduleResult.success).toBe(true);
      expect(scheduleResult.data?.rounds.length).toBeGreaterThan(0);
      expect(scheduleResult.data?.registrationClosedAt).toBeDefined();
    });

    it('should not generate schedule with too few participants', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 1);
      await manager.openRegistration('tourney-1');

      const result = await manager.generateSchedule('tourney-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Need at least 2 participants');
    });

    it('should start tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');

      const result = await manager.startTournament('tourney-1');
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('running');
      expect(result.data?.startedAt).not.toBeNull();
    });

    it('should not start without schedule', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      // Skip generateSchedule

      const result = await manager.startTournament('tourney-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No schedule generated');
    });

    it('should close registration without generating a schedule or starting execution', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');

      const result = await manager.closeRegistration('tourney-1');
      const tournament = (await manager.loadTournament('tourney-1')).data!;

      expect(result.success).toBe(true);
      expect(tournament.status).toBe('registration_closed');
      expect(tournament.rounds).toHaveLength(0);
      expect(tournament.startedAt).toBeNull();
    });

    it('should leave a scheduled tournament closed until start is requested', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');

      const result = await manager.closeRegistration('tourney-1');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('registration_closed');
      expect(result.data?.startedAt).toBeNull();
    });
  });

  describe('Match Execution', () => {
    it('serializes concurrent participation requests without losing either mutation', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'request-serialization', 'Request serialization');
      await manager.openRegistration('request-serialization');

      const makeRequest = (competitorId: string, botId: string) => manager.submitParticipationRequest('request-serialization', {
        competitorId,
        botId,
        participantName: competitorId,
        botSnapshot: { botId, command: 'node', args: ['bot.js'] },
      });
      const results = await Promise.all([
        makeRequest('competitor-a', 'bot-a'),
        makeRequest('competitor-b', 'bot-b'),
      ]);

      expect(results.every(result => result.success)).toBe(true);
      const persisted = (await manager.loadTournament('request-serialization')).data!;
      expect(persisted.participationRequests).toHaveLength(2);
      expect(persisted.participationRequests?.map(request => request.botId)).toEqual(expect.arrayContaining(['bot-a', 'bot-b']));
    });

    it('allows only one concurrent active request for the same competitor Bot', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'request-deduplication', 'Request deduplication');
      await manager.openRegistration('request-deduplication');
      const request = {
        competitorId: 'competitor-a',
        botId: 'bot-a',
        participantName: 'Competitor A',
        botSnapshot: { botId: 'bot-a', command: 'node', args: ['bot.js'] },
      };

      const results = await Promise.all([
        manager.submitParticipationRequest('request-deduplication', request),
        manager.submitParticipationRequest('request-deduplication', request),
      ]);
      expect(results.filter(result => result.success)).toHaveLength(1);
      expect(results.filter(result => !result.success)[0]?.error).toContain('active participation request');
      expect((await manager.loadTournament('request-deduplication')).data?.participationRequests).toHaveLength(1);
    });

    it('serializes concurrent approvals and preserves each participant projection', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'approval-serialization', 'Approval serialization');
      await manager.openRegistration('approval-serialization');
      const requests = await Promise.all(['a', 'b'].map(suffix => manager.submitParticipationRequest('approval-serialization', {
        competitorId: `competitor-${suffix}`,
        botId: `bot-${suffix}`,
        participantName: `Competitor ${suffix}`,
        botSnapshot: { botId: `bot-${suffix}`, command: 'node', args: ['bot.js'] },
      })));
      const approvalResults = await Promise.all(requests.map(result => manager.reviewParticipationRequest(
        'approval-serialization', result.data!.requestId, 'organizer', 'approve'
      )));

      expect(approvalResults.every(result => result.success)).toBe(true);
      const persisted = (await manager.loadTournament('approval-serialization')).data!;
      expect(persisted.participants).toHaveLength(2);
      expect(persisted.participationRequests?.every(request => request.status === 'approved')).toBe(true);
      expect(persisted.participationRequests?.every(request => persisted.participants.some(participant => participant.bot.botId === request.botId))).toBe(true);
    });

    it('does not mark approval or add a participant when approval persistence fails', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'approval-failure', 'Approval failure');
      await manager.openRegistration('approval-failure');
      const submitted = await manager.submitParticipationRequest('approval-failure', {
        competitorId: 'competitor-a',
        botId: 'bot-a',
        participantName: 'Competitor A',
        botSnapshot: { botId: 'bot-a', command: 'node', args: ['bot.js'] },
      });
      const originalSave = repository.save.bind(repository);
      repository.save = async () => { throw new Error('injected approval persistence failure'); };
      await expect(manager.reviewParticipationRequest('approval-failure', submitted.data!.requestId, 'organizer', 'approve'))
        .rejects.toThrow('injected approval persistence failure');
      repository.save = originalSave;

      const persisted = (await manager.loadTournament('approval-failure')).data!;
      expect(persisted.participants).toHaveLength(0);
      expect(persisted.participationRequests?.[0]).toMatchObject({ status: 'pending', reviewedAt: null, reviewedBy: null });
    });

    it('should run next match', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');
      await manager.startTournament('tourney-1');

      // Configure mock
      mockExecutor.setMatchResult('tourney-1-P1-v-P2-r1', createMockMatchResult('tourney-1-P1-v-P2-r1'));

      const result = await manager.runNextMatch('tourney-1');
      expect(result.success).toBe(true);
      expect(result.data?.matchResult.winner).toBe('A');
    });

    it('should run all matches sequentially', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 3);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');
      await manager.startTournament('tourney-1');

      // Configure mocks for all 3 matches (3 participants = 3 rounds, 1 match per round = 3 matches)
      const schedule = (await manager.loadTournament('tourney-1')).data!;
      for (const round of schedule.rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB) {
            const matchId = `tourney-1-${pairing.pairingId}`;
            mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
          }
        }
      }

      const result = await manager.runAllMatches('tourney-1');
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3); // 3 participants, 3 rounds, 1 match per round = 3 matches
    });

    it('persists an explicit failed pairing and retries it only on a later run request', async () => {
      let attempts = 0;
      const executor: MatchExecutor = {
        async executeMatch(matchId) {
          attempts += 1;
          if (attempts === 1) throw new Error('Docker source runtime is unavailable');
          return createMockMatchResult(matchId);
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor });
      await createTestTournament(manager, 'retry-failed-pairing', 'Retry failed pairing');
      await registerParticipants(manager, 'retry-failed-pairing', 2);
      await manager.openRegistration('retry-failed-pairing');
      await manager.generateSchedule('retry-failed-pairing');
      await manager.startTournament('retry-failed-pairing');

      const firstRun = await manager.runAllMatches('retry-failed-pairing');
      expect(firstRun.success).toBe(false);
      const failed = (await manager.loadTournament('retry-failed-pairing')).data!;
      expect(failed.status).toBe('running');
      expect(failed.rounds[0]?.pairings[0]).toMatchObject({
        status: 'failed',
        failureCode: 'DOCKER_INFRASTRUCTURE',
        failureReason: 'Docker execution infrastructure failed',
      });

      const retryRun = await manager.runAllMatches('retry-failed-pairing');
      expect(retryRun.success).toBe(true);
      const completed = (await manager.loadTournament('retry-failed-pairing')).data!;
      expect(completed.status).toBe('completed');
      expect(completed.rounds[0]?.pairings[0]?.status).toBe('completed');
    });

    it('should complete tournament after all matches', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');
      await manager.startTournament('tourney-1');

      mockExecutor.setMatchResult('tourney-1-P1-v-P2-r1', createMockMatchResult('tourney-1-P1-v-P2-r1'));

      await manager.runAllMatches('tourney-1');

      const tournament = (await manager.loadTournament('tourney-1')).data!;
      expect(tournament.status).toBe('completed');
      expect(tournament.completedAt).toBeDefined();
    });

    it('persists in-progress pairing before invoking the executor', async () => {
      let persistedBeforeExecution = false;
      const executor: MatchExecutor = {
        async executeMatch(matchId) {
          const persisted = (await repository.load('durable-start'))!;
          const pairing = persisted.rounds[0]?.pairings[0];
          persistedBeforeExecution = pairing?.status === 'in_progress' && pairing.matchId === matchId;
          return createMockMatchResult(matchId);
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor });

      await createTestTournament(manager, 'durable-start', 'Durable start');
      await registerParticipants(manager, 'durable-start', 2);
      await manager.openRegistration('durable-start');
      await manager.generateSchedule('durable-start');
      await manager.startTournament('durable-start');

      const result = await manager.runNextMatch('durable-start');
      expect(result.success).toBe(true);
      expect(persistedBeforeExecution).toBe(true);
    });

    it('does not invoke the executor when the in-progress transition cannot be saved', async () => {
      let executed = false;
      const executor: MatchExecutor = {
        async executeMatch(matchId) {
          executed = true;
          return createMockMatchResult(matchId);
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor });
      await createTestTournament(manager, 'durable-failure', 'Durable failure');
      await registerParticipants(manager, 'durable-failure', 2);
      await manager.openRegistration('durable-failure');
      await manager.generateSchedule('durable-failure');
      await manager.startTournament('durable-failure');

      const originalSave = repository.save.bind(repository);
      let failNextSave = true;
      repository.save = async tournament => {
        if (failNextSave) {
          failNextSave = false;
          throw new Error('injected start persistence failure');
        }
        await originalSave(tournament);
      };

      const result = await manager.runNextMatch('durable-failure');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unable to persist match start');
      expect(executed).toBe(false);
      repository.save = originalSave;
    });

    it('uses a strict bounded match ID when participant IDs are long', async () => {
      let executedMatchId = '';
      const executor: MatchExecutor = {
        async executeMatch(matchId) {
          executedMatchId = matchId;
          return createMockMatchResult(matchId);
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor });
      const participantA = `participant-a-${'x'.repeat(55)}`;
      const participantB = `participant-b-${'y'.repeat(55)}`;

      await createTestTournament(manager, 'long-match-id', 'Long match ID');
      await manager.registerParticipant('long-match-id', participantA, 'A', createTestBot('bot-a'));
      await manager.registerParticipant('long-match-id', participantB, 'B', createTestBot('bot-b'));
      await manager.openRegistration('long-match-id');
      await manager.generateSchedule('long-match-id');
      await manager.startTournament('long-match-id');

      const result = await manager.runNextMatch('long-match-id');
      expect(result.success).toBe(true);
      expect(executedMatchId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
      expect(executedMatchId.length).toBeLessThanOrEqual(128);
      expect(await repository.loadMatchResult('long-match-id', executedMatchId)).toBeTruthy();
    });

    it('should get standings', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');

      const result = await manager.getStandings('tourney-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should cancel tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');

      const result = await manager.cancelTournament('tourney-1');
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('cancelled');
    });

    it('bounds cancellation while a result write never settles', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        persistenceTimeoutMs: 100,
      });
      await createTestTournament(manager, 'cancel-stalled-write', 'Stalled write');

      let release!: () => void;
      const stalledWrite = new Promise<void>(resolve => { release = resolve; });
      const pendingWrites = (manager as unknown as {
        pendingResultWrites: Map<string, Set<Promise<void>>>;
      }).pendingResultWrites;
      pendingWrites.set('cancel-stalled-write', new Set([stalledWrite]));

      const startedAt = Date.now();
      const result = await manager.cancelTournament('cancel-stalled-write');
      const elapsedMs = Date.now() - startedAt;

      expect(result.success).toBe(false);
      expect(result.error).toContain('still in progress');
      expect(elapsedMs).toBeLessThan(1000);
      expect((await manager.loadTournament('cancel-stalled-write')).data?.status).toBe('draft');

      release();
      pendingWrites.delete('cancel-stalled-write');
    });

    it('cancels after rejected result persistence without waiting indefinitely', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        persistenceTimeoutMs: 100,
      });
      await createTestTournament(manager, 'cancel-rejected-write', 'Rejected write');

      const pendingWrites = (manager as unknown as {
        pendingResultWrites: Map<string, Set<Promise<void>>>;
      }).pendingResultWrites;
      pendingWrites.set('cancel-rejected-write', new Set([
        Promise.reject(new Error('injected result write failure')),
      ]));

      const result = await manager.cancelTournament('cancel-rejected-write');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('cancelled');
    });

    it('returns a failure when terminal cancellation persistence stalls', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        persistenceTimeoutMs: 100,
      });
      await createTestTournament(manager, 'cancel-stalled-terminal', 'Stalled terminal write');

      const originalSave = repository.save.bind(repository);
      repository.save = async () => new Promise<void>(() => {});

      const startedAt = Date.now();
      const result = await manager.cancelTournament('cancel-stalled-terminal');
      const elapsedMs = Date.now() - startedAt;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(elapsedMs).toBeLessThan(1000);
      repository.save = originalSave;
    });

    it('blocks restart until a timed-out late save finishes', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        persistenceTimeoutMs: 25,
      });
      await createTestTournament(manager, 'cancel-restart-write', 'Restart write');

      const originalSave = repository.save.bind(repository);
      let release!: () => void;
      let lateSaveCompleted!: () => void;
      const lateSaveDone = new Promise<void>(resolve => { lateSaveCompleted = resolve; });
      let firstSave = true;
      repository.save = async (tournament) => {
        if (firstSave) {
          firstSave = false;
          const snapshot = structuredClone(tournament);
          await new Promise<void>(resolve => { release = resolve; });
          await originalSave(snapshot);
          lateSaveCompleted();
          return;
        }
        await originalSave(tournament);
      };

      const timedOut = await manager.cancelTournament('cancel-restart-write');
      expect(timedOut.success).toBe(false);
      const recoveryWrite = manager.updateMetadata('cancel-restart-write', { recovery: 'must-not-overtake' });

      // A restarted process cannot bypass the live writer's ownership.
      const restartedRepository = new FileTournamentRepository({ baseDir: testDir });
      await expect(restartedRepository.initialize()).rejects.toThrow('already owned');
      release();
      await lateSaveDone;
      await recoveryWrite;

      repository.save = originalSave;
      repository.close();
      await restartedRepository.initialize();
      const restartedManager = new TournamentManager({ repository: restartedRepository, executor: mockExecutor });
      await restartedManager.updateMetadata('cancel-restart-write', { recovery: 'newer-write' });

      const persisted = (await restartedManager.loadTournament('cancel-restart-write')).data!;
      expect(persisted.metadata).toEqual({ recovery: 'newer-write' });
      expect(persisted.status).toBe('cancelled');
      restartedRepository.close();
    });

    it('handles repeated cancellation without changing the terminal result', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        persistenceTimeoutMs: 100,
      });
      await createTestTournament(manager, 'cancel-repeat', 'Repeated cancellation');

      const first = await manager.cancelTournament('cancel-repeat');
      const second = await manager.cancelTournament('cancel-repeat');

      expect(first.success).toBe(true);
      expect(second.success).toBe(false);
      expect((await manager.loadTournament('cancel-repeat')).data?.status).toBe('cancelled');
    });

    it('keeps cancellation terminal while an active match is stopping', async () => {
      let started = false;
      let release!: () => void;
      const executor: MatchExecutor = {
        async executeMatch(_matchId, _playerA, _playerB, _config, _callbacks, signal) {
          started = true;
          return new Promise((_resolve, reject) => {
            release = () => reject(new ExecutionCancelledError());
            signal?.addEventListener('abort', () => reject(new ExecutionCancelledError()), { once: true });
          });
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor });

      await createTestTournament(manager, 'cancel-active', 'Cancel active');
      await registerParticipants(manager, 'cancel-active', 2);
      await manager.openRegistration('cancel-active');
      await manager.generateSchedule('cancel-active');
      await manager.startTournament('cancel-active');

      const controller = new AbortController();
      const running = manager.runAllMatches('cancel-active', controller.signal);
      while (!started) await new Promise<void>(resolve => setImmediate(resolve));

      const cancelled = await manager.cancelTournament('cancel-active');
      expect(cancelled.success).toBe(true);
      controller.abort();
      release();

      const runResult = await running;
      expect(runResult.success).toBe(false);
      expect(runResult.error).toBe('Tournament execution cancelled');

      const persisted = (await manager.loadTournament('cancel-active')).data!;
      expect(persisted.status).toBe('cancelled');
      expect(await repository.listMatchResults('cancel-active')).toHaveLength(0);
    });

    it('restores a pairing when match-result persistence fails', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'persist-failure', 'Persistence failure');
      await registerParticipants(manager, 'persist-failure', 2);
      await manager.openRegistration('persist-failure');
      await manager.generateSchedule('persist-failure');
      await manager.startTournament('persist-failure');

      const matchId = 'persist-failure-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
      const originalSaveMatchResult = repository.saveMatchResult.bind(repository);
      repository.saveMatchResult = async () => {
        throw new Error('injected result write failure');
      };

      const result = await manager.runNextMatch('persist-failure');
      expect(result.success).toBe(false);
      expect(result.error).toContain('persistence failed');

      const tournament = (await manager.loadTournament('persist-failure')).data!;
      const pairing = tournament.rounds[0]?.pairings[0];
      expect(pairing?.status).toBe('failed');
      expect(pairing).toMatchObject({
        failureCode: 'PERSISTENCE',
        failureReason: 'Match result persistence failed',
      });
      repository.saveMatchResult = originalSaveMatchResult;
    });
  });

  describe('Result Publication', () => {
    it('publishes a completed tournament idempotently after validating results and replays', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'publication-success', 'Publication success');
      await registerParticipants(manager, 'publication-success', 2);
      await manager.openRegistration('publication-success');
      await manager.generateSchedule('publication-success');
      await manager.startTournament('publication-success');
      const matchId = 'publication-success-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
      const execution = await manager.runAllMatches('publication-success');
      expect(execution.success).toBe(true);

      const [published, repeated] = await Promise.all([
        manager.publishResults('publication-success'),
        manager.publishResults('publication-success'),
      ]);
      expect(published.success).toBe(true);
      const firstTimestamp = published.data?.resultsPublishedAt;
      expect(firstTimestamp).toBeTruthy();
      expect(repeated.success).toBe(true);
      expect(repeated.data?.resultsPublishedAt).toBe(firstTimestamp);
      expect((await manager.loadTournament('publication-success')).data?.rounds[0].pairings[0].matchId).toBe(matchId);
    });

    it('publishes a valid Bot-forfeit result when the engine final state has no winner', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'publication-bot-forfeit', 'Publication Bot forfeit');
      await registerParticipants(manager, 'publication-bot-forfeit', 2);
      await manager.openRegistration('publication-bot-forfeit');
      await manager.generateSchedule('publication-bot-forfeit');
      await manager.startTournament('publication-bot-forfeit');
      const matchId = 'publication-bot-forfeit-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId, 'B', 'bot_crash'));

      const execution = await manager.runAllMatches('publication-bot-forfeit');
      expect(execution.success).toBe(true);
      const published = await manager.publishResults('publication-bot-forfeit');
      expect(published.success).toBe(true);
      expect(published.data?.resultsPublishedAt).toBeTruthy();
    });

    it('rejects publication when a committed replay is missing', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'publication-incomplete', 'Publication incomplete');
      await registerParticipants(manager, 'publication-incomplete', 2);
      await manager.openRegistration('publication-incomplete');
      await manager.generateSchedule('publication-incomplete');
      await manager.startTournament('publication-incomplete');
      const matchId = 'publication-incomplete-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
      await manager.runAllMatches('publication-incomplete');
      await fs.rm(path.join(testDir, 'publication-incomplete', `replay-${matchId}.json`));

      const result = await manager.publishResults('publication-incomplete');
      expect(result.success).toBe(false);
      expect(result.error).toContain('integrity');
      expect((await manager.loadTournament('publication-incomplete')).data?.resultsPublishedAt).toBeNull();
    });

    it('leaves publication state unchanged when the final save fails', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'publication-save-failure', 'Publication save failure');
      await registerParticipants(manager, 'publication-save-failure', 2);
      await manager.openRegistration('publication-save-failure');
      await manager.generateSchedule('publication-save-failure');
      await manager.startTournament('publication-save-failure');
      const matchId = 'publication-save-failure-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
      await manager.runAllMatches('publication-save-failure');
      const originalSave = repository.save.bind(repository);
      repository.save = async () => { throw new Error('injected publication save failure'); };
      await expect(manager.publishResults('publication-save-failure')).rejects.toThrow('injected publication save failure');
      repository.save = originalSave;
      expect((await manager.loadTournament('publication-save-failure')).data?.resultsPublishedAt).toBeNull();
    });
  });

  describe('Resuming Tournament', () => {
    it('resets an interrupted in-progress pairing without a committed result', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'resume-in-progress', 'Resume in progress');
      await registerParticipants(manager, 'resume-in-progress', 2);
      await manager.openRegistration('resume-in-progress');
      await manager.generateSchedule('resume-in-progress');
      await manager.startTournament('resume-in-progress');

      const interrupted = (await manager.loadTournament('resume-in-progress')).data!;
      const pairing = interrupted.rounds[0].pairings[0];
      pairing.status = 'in_progress';
      pairing.matchId = 'resume-in-progress-interrupted';
      pairing.startedAt = new Date().toISOString();
      await repository.save(interrupted);

      const result = await manager.resumeTournament('resume-in-progress');
      expect(result.success).toBe(true);
      expect(result.data?.rounds[0]?.pairings[0]?.status).toBe('scheduled');
      expect(result.data?.rounds[0]?.pairings[0]?.matchId).toBeNull();
    });

    it('runAllMatches recovers an interrupted pairing before selecting work', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'resume-run-all', 'Resume run all');
      await registerParticipants(manager, 'resume-run-all', 2);
      await manager.openRegistration('resume-run-all');
      await manager.generateSchedule('resume-run-all');
      await manager.startTournament('resume-run-all');

      const interrupted = (await manager.loadTournament('resume-run-all')).data!;
      const pairing = interrupted.rounds[0].pairings[0];
      pairing.status = 'in_progress';
      pairing.matchId = 'resume-run-all-interrupted';
      pairing.startedAt = new Date().toISOString();
      await repository.save(interrupted);

      const matchId = 'resume-run-all-P1-v-P2-r1';
      mockExecutor.setMatchResult(matchId, createMockMatchResult(matchId));
      const result = await manager.runAllMatches('resume-run-all');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect((await manager.loadTournament('resume-run-all')).data?.status).toBe('completed');
    });

    it('should resume interrupted tournament', async () => {
      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');
      await manager.startTournament('tourney-1');

      mockExecutor.setMatchResult('tourney-1-P1-v-P2-r1', createMockMatchResult('tourney-1-P1-v-P2-r1'));
      await manager.runNextMatch('tourney-1');

      // Simulate restart - create new manager instance
      const manager2 = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      const resumeResult = await manager2.resumeTournament('tourney-1');
      expect(resumeResult.success).toBe(true);

      const tournament = resumeResult.data!;
      expect(tournament.rounds[0].pairings[0].status).toBe('completed');
      expect(tournament.standings.length).toBe(2);
    });
  });

  describe('Persistence', () => {
    it('should persist tournament across manager instances', async () => {
      const manager1 = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      await createTestTournament(manager1, 'tourney-1', 'Test');
      await registerParticipants(manager1, 'tourney-1', 2);
      await manager1.openRegistration('tourney-1');
      await manager1.generateSchedule('tourney-1');
      await manager1.startTournament('tourney-1');

      mockExecutor.setMatchResult('tourney-1-P1-v-P2-r1', createMockMatchResult('tourney-1-P1-v-P2-r1'));
      await manager1.runNextMatch('tourney-1');

      // New manager instance
      const manager2 = new TournamentManager({
        repository,
        executor: mockExecutor,
      });

      const loaded = await manager2.loadTournament('tourney-1');
      expect(loaded.success).toBe(true);
      expect(loaded.data?.status).toBe('running');
      expect(loaded.data?.rounds[0].pairings[0].status).toBe('completed');
    });
  });
});
