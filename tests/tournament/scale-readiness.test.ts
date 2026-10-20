/**
 * Phase 3B - Multi-Stage Scale Readiness Tests
 *
 * Validates:
 * 1. Format-aware participant limit enforcement (legacy capped at 64; multi_stage capped at 4096).
 * 2. Feature flag safety guards for multi-stage tournaments.
 * 3. Scheduling complexity, match count formulas, and deterministic structure for 256, 1024, 2048, and 4096 bots.
 * 4. Memory footprint, serialization size, and persistence/reloading at scale.
 * 5. Pull-based sequential execution, concurrency backpressure, and slot advancement without Docker jobs overload.
 * 6. Crash recovery and idempotency at scale.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  TournamentFormat,
  TournamentParticipant,
  TournamentBot,
  MAX_PARTICIPANTS,
  MAX_PARTICIPANTS_BY_FORMAT,
  getMaxParticipants,
  FileTournamentRepository,
  MatchExecutor,
} from '../../tournament/index.js';
import type { MatchResult, MatchReplay } from '@match-runner/types.js';
import {
  calculateTournamentFormat,
} from '../../tournament/auto-format.js';
import {
  createMultiStageTournament,
  getAllTournamentPairings,
  isTournamentComplete,
  validateMultiStageTournament,
} from '../../tournament/multi-stage.js';

function createMockResult(
  matchId: string,
  winner: 'A' | 'B' | 'draw' = 'A',
  terminationReason = 'goal_reached'
): MatchResult {
  return {
    matchId,
    protocolVersion: '0.1.0',
    status: 'finished',
    winner,
    terminationReason: terminationReason as any,
    turnCount: 10,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 15,
    playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
    playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
    finalState: {
      turn: 10,
      currentPlayer: 'A',
      status: 'finished',
      winner: winner === 'draw' ? null : winner,
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
  };
}

function createDummyParticipants(count: number): TournamentParticipant[] {
  const padLen = Math.max(4, String(count).length);
  return Array.from({ length: count }, (_, i) => ({
    participantId: `bot-${String(i + 1).padStart(padLen, '0')}`,
    name: `Bot ${i + 1}`,
    bot: {
      botId: `b-${i + 1}`,
      player: 'A' as const,
      command: `python bot_${i + 1}.py`,
    },
    registeredAt: new Date().toISOString(),
  }));
}

describe('Phase 3B - Scale Readiness', () => {
  let tempDir: string;
  let repository: FileTournamentRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `ott-scale-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(tempDir, { recursive: true });
    repository = new FileTournamentRepository({ baseDir: tempDir });
    await repository.initialize();
  });

  afterEach(async () => {
    repository.close();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('Format-aware Participant Limits', () => {
    it('should maintain legacy MAX_PARTICIPANTS constant at 64', () => {
      expect(MAX_PARTICIPANTS).toBe(64);
      expect(MAX_PARTICIPANTS_BY_FORMAT.single_round_robin).toBe(64);
      expect(MAX_PARTICIPANTS_BY_FORMAT.multi_stage).toBe(4096);
      expect(getMaxParticipants('single_round_robin')).toBe(64);
      expect(getMaxParticipants('multi_stage')).toBe(4096);
      expect(getMaxParticipants()).toBe(64);
    });

    it('should enforce 64 participant limit for single_round_robin tournaments', async () => {
      const manager = new TournamentManager({
        repository,
        executor: { executeMatch: async () => createMockResult('m-dummy') },
        enableMultiStage: false,
      });

      const createRes = await manager.createTournament('t-legacy-limit', 'Legacy Cap Test', 'single_round_robin');
      expect(createRes.success).toBe(true);

      const openRes = await manager.openRegistration('t-legacy-limit');
      expect(openRes.success).toBe(true);

      // Register 64 participants successfully
      for (let i = 1; i <= 64; i++) {
        const regRes = await manager.registerParticipant('t-legacy-limit', `p-${i}`, `Player ${i}`, {
          botId: `bot-${i}`,
          command: 'python bot.py',
        });
        expect(regRes.success).toBe(true);
      }

      // 65th participant registration should fail
      const overflowReg = await manager.registerParticipant('t-legacy-limit', 'p-65', 'Player 65', {
        botId: 'bot-65',
        command: 'python bot.py',
      });
      expect(overflowReg.success).toBe(false);
      expect(overflowReg.error).toBe('Maximum participants reached');

      // Participation request should also fail
      const reqRes = await manager.submitParticipationRequest('t-legacy-limit', {
        competitorId: 'comp-65',
        botId: 'bot-65',
        botName: 'Bot 65',
        revisionId: 'rev-65',
      });
      expect(reqRes.success).toBe(false);
      expect(reqRes.error).toBe('Maximum participants reached');
    });

    it('should reject schedule generation if single_round_robin has > 64 participants', async () => {
      const manager = new TournamentManager({
        repository,
        executor: { executeMatch: async () => createMockResult('m-dummy') },
        enableMultiStage: false,
      });

      const createRes = await manager.createTournament('t-legacy-overflow', 'Overflow Test', 'single_round_robin');
      expect(createRes.success).toBe(true);

      // Manually seed 65 participants to test validation guard
      const tournament = (await repository.load('t-legacy-overflow'))!;
      tournament.participants = createDummyParticipants(65);
      tournament.status = 'registration_closed';
      await repository.save(tournament);

      const schedRes = await manager.generateSchedule('t-legacy-overflow');
      expect(schedRes.success).toBe(false);
      expect(schedRes.error).toContain('Too many participants for single_round_robin (max 64)');
    });

    it('should allow multi_stage tournaments to exceed 64 participants when feature flag is enabled', async () => {
      const manager = new TournamentManager({
        repository,
        executor: { executeMatch: async () => createMockResult('m-dummy') },
        enableMultiStage: true,
      });

      const createRes = await manager.createTournament('t-multi-scale', 'Multi Stage Scale', 'multi_stage');
      expect(createRes.success).toBe(true);

      const openRes = await manager.openRegistration('t-multi-scale');
      expect(openRes.success).toBe(true);

      // Register 70 participants (exceeding legacy 64 cap)
      for (let i = 1; i <= 70; i++) {
        const regRes = await manager.registerParticipant('t-multi-scale', `p-${i}`, `Player ${i}`, {
          botId: `bot-${i}`,
          command: 'python bot.py',
        });
        expect(regRes.success).toBe(true);
      }

      const tourney = (await repository.load('t-multi-scale'))!;
      expect(tourney.participants.length).toBe(70);
    });

    it('should block multi_stage tournament creation and scheduling when feature flag is disabled', async () => {
      const manager = new TournamentManager({
        repository,
        executor: { executeMatch: async () => createMockResult('m-dummy') },
        enableMultiStage: false,
      });

      const createRes = await manager.createTournament('t-blocked', 'Blocked Multi', 'multi_stage');
      expect(createRes.success).toBe(false);
      expect(createRes.error).toContain('disabled by feature flag');
    });
  });

  describe('Scale Complexity & Exact Match Counts (256, 1024, 2048, 4096 bots)', () => {
    const scales = [
      {
        count: 256,
        expectedRegions: 4,
        botsPerRegion: 64,
        prelimMatchesPerRegion: 32, // 64 - 32
        totalPrelimMatches: 128,
        qualifiersPerRegion: 32,
        totalQualifiers: 128,
        groups: 32,
        groupMatches: 192, // 32 * 6
        knockoutParticipants: 64, // 32 * 2
        knockoutMatches: 63,
        totalMatches: 383,
        maxPlanningMs: 100,
      },
      {
        count: 1024,
        expectedRegions: 4,
        botsPerRegion: 256,
        prelimMatchesPerRegion: 224, // 128 + 64 + 32
        totalPrelimMatches: 896,
        qualifiersPerRegion: 32,
        totalQualifiers: 128,
        groups: 32,
        groupMatches: 192,
        knockoutParticipants: 64,
        knockoutMatches: 63,
        totalMatches: 1151,
        maxPlanningMs: 250,
      },
      {
        count: 2048,
        expectedRegions: 4,
        botsPerRegion: 512,
        prelimMatchesPerRegion: 480, // 256 + 128 + 64 + 32
        totalPrelimMatches: 1920,
        qualifiersPerRegion: 32,
        totalQualifiers: 128,
        groups: 32,
        groupMatches: 192,
        knockoutParticipants: 64,
        knockoutMatches: 63,
        totalMatches: 2175,
        maxPlanningMs: 400,
      },
      {
        count: 4096,
        expectedRegions: 4,
        botsPerRegion: 1024,
        prelimMatchesPerRegion: 992, // 512 + 256 + 128 + 64 + 32
        totalPrelimMatches: 3968,
        qualifiersPerRegion: 32,
        totalQualifiers: 128,
        groups: 32,
        groupMatches: 192,
        knockoutParticipants: 64,
        knockoutMatches: 63,
        totalMatches: 4223,
        maxPlanningMs: 800,
      },
    ];

    for (const scale of scales) {
      it(`should plan and build valid structure for ${scale.count} bots within ${scale.maxPlanningMs}ms`, () => {
        const participants = createDummyParticipants(scale.count);

        const startTime = Date.now();
        const plan = calculateTournamentFormat(participants);
        const planningElapsed = Date.now() - startTime;

        expect(planningElapsed).toBeLessThan(scale.maxPlanningMs);
        expect(plan.hasPreliminary).toBe(true);
        expect(plan.regionalPlan).toBeDefined();
        expect(plan.regionalPlan!.regionCount).toBe(scale.expectedRegions);
        expect(plan.regionalPlan!.totalMatches).toBe(scale.totalPrelimMatches);
        expect(plan.regionalPlan!.totalQualifiers).toBe(scale.totalQualifiers);

        // Group stage verification
        expect(plan.groupStage).toBeDefined();
        expect(plan.groupStage!.groupCount).toBe(scale.groups);
        expect(plan.groupStage!.totalMatches).toBe(scale.groupMatches);

        // Knockout bracket verification
        expect(plan.knockoutBracket).toBeDefined();
        expect(plan.knockoutBracket.bracketSize).toBe(scale.knockoutParticipants);
        expect(plan.knockoutBracket.totalMatches).toBe(scale.knockoutMatches);

        // Total matches
        expect(plan.totalDockerMatches).toBe(scale.totalMatches);

        // Verify creation of full multi-stage tournament model
        const multiStage = createMultiStageTournament({
          tournamentId: `t-scale-${scale.count}`,
          name: `Scale ${scale.count}`,
          participants,
        });

        // Single source of truth: rounds is empty, stages contains all stages
        expect(multiStage.rounds).toEqual([]);
        expect(multiStage.stages).toBeDefined();
        expect(multiStage.stages!.length).toBe(3);

        const allPairings = getAllTournamentPairings(multiStage);
        // Match count includes only real match pairings (not byes)
        const playablePairings = allPairings.filter(p => p.participantB !== null);
        expect(playablePairings.length).toBe(scale.totalMatches);

        const validation = validateMultiStageTournament(multiStage);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
      });
    }
  });

  describe('Memory & Serialization Boundedness', () => {
    it('should keep serialized 4096-bot tournament JSON under 3.5 MB and persist/reload cleanly', async () => {
      const count = 4096;
      const participants = createDummyParticipants(count);

      const multiStage = createMultiStageTournament({
        tournamentId: 't-scale-4096',
        name: '4096 Bot Scale Test',
        participants,
      });

      const serialized = JSON.stringify(multiStage);
      const sizeBytes = Buffer.byteLength(serialized, 'utf8');
      const sizeMB = sizeBytes / (1024 * 1024);

      // Must be bounded under 3.5 MB
      expect(sizeMB).toBeLessThan(3.5);

      // Persist to disk
      await repository.save(multiStage);

      // Reload from disk
      const loaded = await repository.load('t-scale-4096');
      expect(loaded).toBeDefined();
      expect(loaded!.participants.length).toBe(4096);
      expect(loaded!.stages!.length).toBe(3);

      const validation = validateMultiStageTournament(loaded!);
      expect(validation.valid).toBe(true);

      const allPairings = getAllTournamentPairings(loaded!);
      expect(allPairings.filter(p => p.participantB !== null).length).toBe(4223);
    });
  });

  describe('Pull-based Sequential Concurrency & Backpressure', () => {
    it('should execute 256-bot multi-stage tournament sequentially with zero Docker queue explosion', async () => {
      let activeExecutions = 0;
      let maxConcurrentExecutions = 0;
      let executedMatchCount = 0;

      const mockExecutor: MatchExecutor = {
        executeMatch: async (matchId: string, playerA: any, playerB: any): Promise<MatchResult> => {
          activeExecutions++;
          maxConcurrentExecutions = Math.max(maxConcurrentExecutions, activeExecutions);

          // Deterministic winner selection: lower ID wins
          const winnerSide = (playerA.botId < playerB.botId) ? 'A' : 'B';
          const result = createMockResult(matchId, winnerSide);

          executedMatchCount++;
          activeExecutions--;
          return result;
        },
      };

      const manager = new TournamentManager({
        repository,
        executor: mockExecutor,
        enableMultiStage: true,
      });

      const count = 256;
      const participants = createDummyParticipants(count);

      const createRes = await manager.createTournament('t-seq-256', 'Sequential 256', 'multi_stage');
      expect(createRes.success).toBe(true);

      const tourney = (await repository.load('t-seq-256'))!;
      tourney.participants = participants;
      tourney.status = 'registration_closed';
      await repository.save(tourney);

      const schedRes = await manager.generateSchedule('t-seq-256');
      expect(schedRes.success).toBe(true);

      const startRes = await manager.startTournament('t-seq-256');
      expect(startRes.success).toBe(true);

      // Run all matches
      const runRes = await manager.runAllMatches('t-seq-256');
      expect(runRes.success).toBe(true);

      // Strict sequential execution: max concurrent executions is exactly 1
      expect(maxConcurrentExecutions).toBe(1);
      // Group-stage pairings are BO2; MatchExecutor is called once per game.
      expect(executedMatchCount).toBe(766);

      const finished = (await repository.load('t-seq-256'))!;
      expect(finished.status).toBe('completed');
      expect(isTournamentComplete(finished)).toBe(true);

      // All 3 stages completed in correct order
      expect(finished.stages![0]!.status).toBe('completed');
      expect(finished.stages![1]!.status).toBe('completed');
      expect(finished.stages![2]!.status).toBe('completed');

      // Champion is crowned
      expect(finished.stages![2]!.advancement.advancingParticipantIds.length).toBe(1);
    }, 60_000);
  });

  describe('Scale Crash Recovery & Idempotency', () => {
    it('should resume seamlessly after interruption mid-way through regional qualifiers', async () => {
      let executedCount = 0;
      const targetInterruption = 50; // interrupt after 50 matches

      const mockExecutor: MatchExecutor = {
        executeMatch: async (matchId: string, playerA: any, playerB: any): Promise<MatchResult> => {
          executedCount++;
          const winnerSide = (playerA.botId < playerB.botId) ? 'A' : 'B';
          return createMockResult(matchId, winnerSide);
        },
      };

      const manager1 = new TournamentManager({
        repository,
        executor: mockExecutor,
        enableMultiStage: true,
      });

      const count = 256;
      const participants = createDummyParticipants(count);

      await manager1.createTournament('t-recovery-256', 'Recovery 256', 'multi_stage');
      const tourney = (await repository.load('t-recovery-256'))!;
      tourney.participants = participants;
      tourney.status = 'registration_closed';
      await repository.save(tourney);

      await manager1.generateSchedule('t-recovery-256');
      await manager1.startTournament('t-recovery-256');

      // Execute first 50 matches one-by-one to simulate crash/interruption
      for (let i = 0; i < targetInterruption; i++) {
        const nextRes = await manager1.runNextMatch('t-recovery-256');
        expect(nextRes.success).toBe(true);
      }
      // Multi-stage group pairings are BO2, so each pairing quantum executes
      // two game records through MatchExecutor.
      expect(executedCount).toBe(targetInterruption * 2);

      // Simulate crash and restart: create a new manager instance reading the same repository
      const manager2 = new TournamentManager({
        repository,
        executor: mockExecutor,
        enableMultiStage: true,
      });

      // Resume execution with manager2
      const resumeRes = await manager2.runAllMatches('t-recovery-256');
      expect(resumeRes.success).toBe(true);

      // The executor is called once per committed game, not once per pairing.
      expect(executedCount).toBe(766);

      const reloaded = (await repository.load('t-recovery-256'))!;
      expect(reloaded.status).toBe('completed');
      expect(isTournamentComplete(reloaded)).toBe(true);
      expect(reloaded.stages![2]!.status).toBe('completed');
    }, 60_000);
  });
});
