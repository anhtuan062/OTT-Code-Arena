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
      winner,
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

    it('should not let close registration bypass schedule and start invariants', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');

      const result = await manager.closeRegistration('tourney-1');
      const tournament = (await manager.loadTournament('tourney-1')).data!;

      expect(result.success).toBe(false);
      expect(result.error).toContain('No schedule generated');
      expect(tournament.status).toBe('registration_open');
      expect(tournament.rounds).toHaveLength(0);
      expect(tournament.startedAt).toBeNull();
    });

    it('should let close registration start a scheduled tournament with startedAt', async () => {
      const manager = new TournamentManager({ repository, executor: mockExecutor });
      await createTestTournament(manager, 'tourney-1', 'Test');
      await registerParticipants(manager, 'tourney-1', 2);
      await manager.openRegistration('tourney-1');
      await manager.generateSchedule('tourney-1');

      const result = await manager.closeRegistration('tourney-1');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('running');
      expect(result.data?.startedAt).not.toBeNull();
    });
  });

  describe('Match Execution', () => {
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
      expect(pairing?.status).toBe('scheduled');
      repository.saveMatchResult = originalSaveMatchResult;
    });
  });

  describe('Resuming Tournament', () => {
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
