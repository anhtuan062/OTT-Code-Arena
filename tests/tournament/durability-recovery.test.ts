/**
 * Phase 3E: Tournament Durability & Recovery Validation
 *
 * Validates:
 * 1. Multi-Cycle 256-Bot Resource & Heap Trend:
 *    - 3 full cycles of 256-bot multi-stage tournaments in isolated QA environments.
 *    - Measure lifecycle time, throughput, save/load counts, match result writes, and heap stability.
 * 2. Heterogeneous 4-Region State & Server Restart:
 *    - Region 1: completed with 32 qualifiers.
 *    - Region 2: partially completed.
 *    - Region 3: in-progress pairing crash (uncommitted).
 *    - Region 4: scheduled.
 *    - Server restart: in-progress pairing cleanly reset, completed regions preserved, Group Stage locked.
 *    - Seamless resume to completion with 0 duplicate executions and 0 lost qualifiers.
 * 3. Fault Injection at Persistence Boundaries:
 *    - saveMatchResult fault injection (I/O error handling, pairing status failed with PERSISTENCE).
 *    - saveTournament crash after saveMatchResult (authoritative match record recovery).
 *    - advancement barrier protection (no early unlock).
 *    - pending_tiebreaker preservation across restarts.
 *    - audit commit verification and idempotency for tiebreaker decisions.
 * 4. Stale State Rollback & Authoritative Match Record Recovery:
 *    - tournament.json restored to an earlier snapshot while downstream match records exist on disk.
 *    - Reconciles match records hierarchically without losing committed winner slots.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  TournamentFormat,
  TournamentParticipant,
  TournamentPairing,
  TournamentMatchRecord,
  FileTournamentRepository,
} from '../../tournament/index.js';
import type { MatchExecutor } from '../../tournament/executor.js';
import type { MatchResult, MatchReplay, BotDefinition, MatchConfig } from '@match-runner/types.js';
import {
  createMultiStageTournament,
  getAllTournamentPairings,
  getExecutablePairings,
  isTournamentComplete,
  validateMultiStageTournament,
  commitMatchResultAndResolveSlots,
  isSlotPlaceholder,
} from '../../tournament/multi-stage.js';

// Instrumented Repository to capture exact I/O telemetry
class DurabilityTrackingRepository extends FileTournamentRepository {
  public saveCount = 0;
  public loadCount = 0;
  public saveMatchResultCount = 0;
  public loadMatchResultCount = 0;
  public listMatchResultsCount = 0;

  // Fault injection hooks
  public failNextSaveMatchResult = false;
  public failNextSaveTournament = false;
  public failSaveTournamentOnCompleted = false;

  override async save(tournament: any): Promise<void> {
    if (this.failNextSaveTournament) {
      this.failNextSaveTournament = false;
      throw new Error('INJECTED_FAULT: saveTournament disk failure');
    }
    if (this.failSaveTournamentOnCompleted) {
      const allPairings = getAllTournamentPairings(tournament);
      if (allPairings.some(p => p.status === 'completed')) {
        this.failSaveTournamentOnCompleted = false;
        throw new Error('INJECTED_FAULT: saveTournament disk failure after match result saved');
      }
    }
    this.saveCount++;
    return super.save(tournament);
  }

  override async load(tournamentId: string): Promise<any> {
    this.loadCount++;
    return super.load(tournamentId);
  }

  override async saveMatchResult(
    tournamentId: string,
    matchId: string,
    result: TournamentMatchRecord,
    replay: object
  ): Promise<void> {
    if (this.failNextSaveMatchResult) {
      this.failNextSaveMatchResult = false;
      throw new Error('INJECTED_FAULT: saveMatchResult I/O error');
    }
    this.saveMatchResultCount++;
    return super.saveMatchResult(tournamentId, matchId, result, replay);
  }

  override async loadMatchResult(tournamentId: string, matchId: string): Promise<TournamentMatchRecord | null> {
    this.loadMatchResultCount++;
    return super.loadMatchResult(tournamentId, matchId);
  }

  override async listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]> {
    this.listMatchResultsCount++;
    return super.listMatchResults(tournamentId);
  }
}

// Deterministic Mock Match Executor
class DurabilityMockExecutor implements MatchExecutor {
  public executedMatches: string[] = [];
  public customOutcomes = new Map<string, 'A' | 'B' | 'draw'>();

  async isAvailable(): Promise<boolean> {
    return true;
  }

  setOutcome(matchId: string, winner: 'A' | 'B' | 'draw'): void {
    this.customOutcomes.set(matchId, winner);
  }

  async executeMatch(
    matchId: string,
    playerA: BotDefinition,
    playerB: BotDefinition,
    config: MatchConfig,
    callbacks?: any,
    signal?: AbortSignal
  ): Promise<MatchResult> {
    if (signal?.aborted) {
      const err = new Error('Execution cancelled');
      err.name = 'ExecutionCancelledError';
      throw err;
    }

    this.executedMatches.push(matchId);
    const outcome = this.customOutcomes.get(matchId) ?? (playerA.botId < playerB.botId ? 'A' : 'B');

    const result: MatchResult = {
      matchId,
      protocolVersion: '0.1.0',
      status: 'finished',
      winner: outcome,
      terminationReason: 'goal_reached' as any,
      turnCount: 8,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 5,
      playerA: { botId: playerA.botId, player: 'A', command: 'mock', args: [] },
      playerB: { botId: playerB.botId, player: 'B', command: 'mock', args: [] },
      finalState: {
        turn: 8,
        currentPlayer: 'A',
        status: 'finished',
        winner: outcome === 'draw' ? null : outcome,
        winReason: 'goal_reached',
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

    return result;
  }
}

function createDummyParticipants(count: number): TournamentParticipant[] {
  const padLen = Math.max(4, String(count).length);
  return Array.from({ length: count }, (_, i) => ({
    participantId: `bot-${String(i + 1).padStart(padLen, '0')}`,
    name: `Bot ${i + 1}`,
    bot: {
      botId: `b-${i + 1}`,
      player: 'A' as const,
      command: `mock-bot-${i + 1}`,
    },
    registeredAt: new Date(1700000000000 + i * 1000).toISOString(),
  }));
}

const EXPECTED_256_PAIRINGS = 383;
// The deterministic executor gives each BO2/BO3 pairing a decisive second game.
const EXPECTED_256_GAME_EXECUTIONS = EXPECTED_256_PAIRINGS * 2;
// Each pairing persists two game checkpoints plus one aggregate series result.
const EXPECTED_256_RESULT_WRITES = EXPECTED_256_PAIRINGS * 3;

describe('Phase 3E - Tournament Durability & Recovery Validation', () => {
  let tempDir: string;
  let repository: DurabilityTrackingRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `ott-p3e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(tempDir, { recursive: true });
    repository = new DurabilityTrackingRepository({ baseDir: tempDir });
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

  describe('1. Multi-Cycle 256-Bot Resource & Heap Trend Analysis', () => {
    it('executes 3 successive 256-bot cycles and validates heap stability, throughput, and zero duplicates', async () => {
      const cycleCount = 3;
      const cycleMetrics: Array<{
        cycle: number;
        durationMs: number;
        throughput: number;
        saves: number;
        loads: number;
        matchWrites: number;
        heapUsedMB: number;
      }> = [];

      for (let c = 1; c <= cycleCount; c++) {
        const cycleDir = path.join(tempDir, `cycle-${c}`);
        await fs.mkdir(cycleDir, { recursive: true });
        const cycleRepo = new DurabilityTrackingRepository({ baseDir: cycleDir });
        await cycleRepo.initialize();

        const executor = new DurabilityMockExecutor();
        const manager = new TournamentManager({
          repository: cycleRepo,
          executor,
          enableMultiStage: true,
        });

        const tournamentId = `t-256-cycle-${c}`;
        const participants = createDummyParticipants(256);

        await manager.createTournament(tournamentId, `Cycle ${c} 256-Bot Arena`, 'multi_stage');
        const loadedDraft = (await cycleRepo.load(tournamentId))!;
        loadedDraft.participants = participants;
        loadedDraft.status = 'registration_closed';
        await cycleRepo.save(loadedDraft);

        await manager.generateSchedule(tournamentId);
        await manager.startTournament(tournamentId);

        const savesBefore = cycleRepo.saveCount;
        const loadsBefore = cycleRepo.loadCount;
        const writesBefore = cycleRepo.saveMatchResultCount;
        const startTime = Date.now();

        const runRes = await manager.runAllMatches(tournamentId);
        expect(runRes.success).toBe(true);

        const durationMs = Date.now() - startTime;
        const throughput = Number((EXPECTED_256_PAIRINGS / (durationMs / 1000)).toFixed(2));
        const finalMem = process.memoryUsage();
        const heapUsedMB = Number((finalMem.heapUsed / (1024 * 1024)).toFixed(2));

        cycleMetrics.push({
          cycle: c,
          durationMs,
          throughput,
          saves: cycleRepo.saveCount - savesBefore,
          loads: cycleRepo.loadCount - loadsBefore,
          matchWrites: cycleRepo.saveMatchResultCount - writesBefore,
          heapUsedMB,
        });
        // Verification for each cycle
        expect(executor.executedMatches.length).toBe(EXPECTED_256_GAME_EXECUTIONS);
        expect(new Set(executor.executedMatches).size).toBe(EXPECTED_256_GAME_EXECUTIONS);

        const finished = (await cycleRepo.load(tournamentId))!;
        expect(finished.status).toBe('completed');
        expect(isTournamentComplete(finished)).toBe(true);
        expect(finished.stages![2]!.advancement.advancingParticipantIds.length).toBe(1);

        cycleRepo.close();
      }

      console.log('\n[Phase 3E - 256-Bot Multi-Cycle Telemetry Summary]');
      for (const m of cycleMetrics) {
        console.log(
          `Cycle ${m.cycle}: Duration=${m.durationMs}ms | Throughput=${m.throughput} matches/s | ` +
          `Saves=${m.saves} | Loads=${m.loads} | MatchWrites=${m.matchWrites} | HeapUsed=${m.heapUsedMB}MB`
        );
      }

      // Verify pairing throughput is robust (> 15 pairings/s)
      for (const m of cycleMetrics) {
        expect(m.throughput).toBeGreaterThan(15);
        expect(m.matchWrites).toBe(EXPECTED_256_RESULT_WRITES);
      }

      // Verify heap stability: Cycle 3 heapUsed should not experience runaway growth (> 350 MB)
      const lastCycleHeap = cycleMetrics[cycleMetrics.length - 1]!.heapUsedMB;
      expect(lastCycleHeap).toBeLessThan(350);
    }, 120_000);
  });

  describe('2. Heterogeneous 4-Region State & Server Restart Simulation', () => {
    it('recovers from restart with 4 regions in different lifecycle states without losing results or unlocking Group Stage early', async () => {
      const executor1 = new DurabilityMockExecutor();
      const manager1 = new TournamentManager({
        repository,
        executor: executor1,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 't-hetero-regions-256';
      const participants = createDummyParticipants(count);

      await manager1.createTournament(tournamentId, 'Heterogeneous Regions Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager1.generateSchedule(tournamentId);
      await manager1.startTournament(tournamentId);

      // Load scheduled tournament to manipulate 4 regions into heterogeneous states
      const tourney = (await repository.load(tournamentId))!;
      const prelimStage = tourney.stages![0]!;
      const [reg1, reg2, reg3, reg4] = prelimStage.regions!;

      // 1. Region 1: Run ALL 32 pairings to completion
      for (const p of reg1!.rounds[0]!.pairings) {
        await manager1.runPairingById(tournamentId, p.pairingId);
      }

      // 2. Region 2: Run 20 pairings to completion
      const reg2Pairings = reg2!.rounds[0]!.pairings;
      for (let i = 0; i < 20; i++) {
        await manager1.runPairingById(tournamentId, reg2Pairings[i]!.pairingId);
      }

      // 3. Region 3: Run 10 pairings to completion, then mark 1 pairing 'in_progress' (simulating crash mid-execution)
      const reg3Pairings = reg3!.rounds[0]!.pairings;
      for (let i = 0; i < 10; i++) {
        await manager1.runPairingById(tournamentId, reg3Pairings[i]!.pairingId);
      }
      const inFlightPairing = reg3Pairings[10]!;
      const tourneyBeforeCrash = (await repository.load(tournamentId))!;
      const inFlightInTourney = getAllTournamentPairings(tourneyBeforeCrash).find(p => p.pairingId === inFlightPairing.pairingId)!;
      inFlightInTourney.status = 'in_progress';
      inFlightInTourney.matchId = `${tournamentId}-${inFlightPairing.pairingId}`;
      inFlightInTourney.startedAt = new Date().toISOString();
      await repository.save(tourneyBeforeCrash);

      // 4. Region 4: 0 pairings run (all 32 remain scheduled)

      // Verify pre-crash state
      const preCrashTourney = (await repository.load(tournamentId))!;
      const prePrelim = preCrashTourney.stages![0]!;
      expect(prePrelim.regions![0]!.status).toBe('completed');
      expect(prePrelim.regions![0]!.advancingParticipantIds).toHaveLength(32);
      expect(prePrelim.regions![1]!.status).not.toBe('completed');
      expect(prePrelim.regions![2]!.status).not.toBe('completed');
      expect(prePrelim.regions![3]!.status).not.toBe('completed');
      expect(preCrashTourney.stages![1]!.status).toBe('pending'); // Group Stage must be pending

      const matchesBeforeRestart = executor1.executedMatches.length;
      expect(matchesBeforeRestart).toBe((32 + 20 + 10) * 2); // 62 pairings, 2 games each

      // 5. SERVER CRASH & REBOOT: New TournamentManager instance pointing to the same repository
      const executor2 = new DurabilityMockExecutor();
      const manager2 = new TournamentManager({
        repository,
        executor: executor2,
        enableMultiStage: true,
      });

      // Run recovery
      const recoveredCount = await manager2.recoverInterruptedTournaments();
      expect(recoveredCount).toBe(1);

      // 6. Verify recovered state before resuming
      const recoveredTourney = (await repository.load(tournamentId))!;
      const recPrelim = recoveredTourney.stages![0]!;
      const recGroup = recoveredTourney.stages![1]!;

      // Region 1 is still completed with 32 qualifiers
      expect(recPrelim.regions![0]!.status).toBe('completed');
      expect(recPrelim.regions![0]!.advancingParticipantIds).toHaveLength(32);

      // Region 3's in_flight pairing was cleanly reset to 'scheduled'
      const resetPairing = getAllTournamentPairings(recoveredTourney).find(p => p.pairingId === inFlightPairing.pairingId)!;
      expect(resetPairing.status).toBe('scheduled');
      expect(resetPairing.matchId).toBeNull();

      // Group stage barrier is preserved: MUST still be pending!
      expect(recGroup.status).toBe('pending');
      const executableBeforeResume = getExecutablePairings(recoveredTourney);
      expect(executableBeforeResume.every(p => p.stageId === 'stage-preliminary')).toBe(true);

      // 7. Resume and complete tournament
      const finishRes = await manager2.runAllMatches(tournamentId);
      expect(finishRes.success).toBe(true);

      // Total game executions: 124 (first run) + 642 (resumed run) = 766
      expect(matchesBeforeRestart + executor2.executedMatches.length).toBe(EXPECTED_256_GAME_EXECUTIONS);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
      expect(isTournamentComplete(finalTourney)).toBe(true);

      // All 3 stages completed in strict order
      expect(finalTourney.stages![0]!.status).toBe('completed');
      expect(finalTourney.stages![1]!.status).toBe('completed');
      expect(finalTourney.stages![2]!.status).toBe('completed');
      expect(finalTourney.stages![2]!.advancement.advancingParticipantIds).toHaveLength(1);
    }, 120_000);
  });

  describe('3. Fault Injection at Persistence Boundaries', () => {
    it('handles saveMatchResult I/O failure gracefully, marking pairing failed without corrupting tournament', async () => {
      const executor = new DurabilityMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const tournamentId = 't-fault-match-result';
      const participants = createDummyParticipants(8);

      await manager.createTournament(tournamentId, 'Fault Match Result Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      const tourney = (await repository.load(tournamentId))!;
      const firstPairing = getAllTournamentPairings(tourney)[0]!;

      // Inject fault on saveMatchResult
      repository.failNextSaveMatchResult = true;

      const runRes = await manager.runPairingById(tournamentId, firstPairing.pairingId);
      expect(runRes.success).toBe(false);
      expect(runRes.error).toContain('Series execution failed: Error: INJECTED_FAULT: saveMatchResult I/O error');

      // Tournament must remain running, pairing must be marked failed with PERSISTENCE
      const tourneyAfterFail = (await repository.load(tournamentId))!;
      expect(tourneyAfterFail.status).toBe('running');
      const failedPairing = getAllTournamentPairings(tourneyAfterFail).find(p => p.pairingId === firstPairing.pairingId)!;
      expect(failedPairing.status).toBe('failed');
      expect(failedPairing.failureCode).toBe('PERSISTENCE');

      // Retry pairing succeeds once disk is restored
      const retryRes = await manager.retryPairingById(tournamentId, firstPairing.pairingId);
      expect(retryRes.success).toBe(true);

      const reloadedAfterRetry = (await repository.load(tournamentId))!;
      const fixedPairing = getAllTournamentPairings(reloadedAfterRetry).find(p => p.pairingId === firstPairing.pairingId)!;
      expect(fixedPairing.status).toBe('completed');
    });

    it('reconciles committed match result when saveTournament crashes right after saveMatchResult', async () => {
      const executor = new DurabilityMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const tournamentId = 't-fault-save-tourney';
      const participants = createDummyParticipants(8);

      await manager.createTournament(tournamentId, 'Fault Save Tourney Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      // Inject fault on saveTournament: fails when pairing completes
      const tourney = (await repository.load(tournamentId))!;
      const firstPairing = getAllTournamentPairings(tourney)[0]!;

      repository.failSaveTournamentOnCompleted = true;

      // runPairing will fail on tournament save after matchResult is already saved to disk
      const runRes = await manager.runPairingById(tournamentId, firstPairing.pairingId);
      expect(runRes.success).toBe(false);
      expect(runRes.error).toContain('Series execution failed: Error: INJECTED_FAULT: saveTournament disk failure after match result saved');

      // Verify that match result exists on disk
      const matchId = `${tournamentId}-${firstPairing.pairingId}`;
      const savedMatch = await repository.loadMatchResult(tournamentId, matchId);
      expect(savedMatch).toBeDefined();
      expect(savedMatch!.winner).toBe('A');

      // Reboot manager
      const rebootManager = new TournamentManager({
        repository,
        executor: new DurabilityMockExecutor(),
        enableMultiStage: true,
      });

      const recovered = await rebootManager.recoverInterruptedTournaments();
      expect(recovered).toBe(1);

      // Verify authoritative record reconciled the pairing without re-running
      const reloadedTourney = (await repository.load(tournamentId))!;
      const reconciledPairing = getAllTournamentPairings(reloadedTourney).find(p => p.pairingId === firstPairing.pairingId)!;
      expect(reconciledPairing.status).toBe('completed');
      expect(reconciledPairing.matchResult?.winner).toBe('A');
    });

    it('preserves pending_tiebreaker across restart, writes durable audit log, and rejects conflicting resolutions', async () => {
      const executor = new DurabilityMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const tournamentId = 't-tiebreaker-audit';
      const participants = createDummyParticipants(8);

      await manager.createTournament(tournamentId, 'Tiebreaker Audit Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      // Fast forward group stage
      while (true) {
        const t = (await repository.load(tournamentId))!;
        const groupStage = t.stages!.find(s => s.stageType === 'group_stage')!;
        if (groupStage.status === 'completed') break;
        await manager.runNextMatch(tournamentId);
      }

      // Now Knockout Stage is in_progress
      const tourneyAfterGroup = (await repository.load(tournamentId))!;
      const koStage = tourneyAfterGroup.stages!.find(s => s.stageType === 'knockout')!;
      const koPairing = koStage.rounds![0]!.pairings[0]!;
      const matchId = `${tournamentId}-${koPairing.pairingId}`;

      // Force draw in elimination match
      for (const gameNumber of [1, 2, 3]) {
        executor.setOutcome(`${matchId}-g${gameNumber}`, 'draw');
      }
      const runRes = await manager.runPairingById(tournamentId, koPairing.pairingId);
      expect(runRes.success).toBe(false);
      expect(runRes.error).toContain('tiebreaker pending');

      // Server crashes while in pending_tiebreaker state!
      const rebootManager = new TournamentManager({
        repository,
        executor: new DurabilityMockExecutor(),
        enableMultiStage: true,
      });

      await rebootManager.recoverInterruptedTournaments();

      // On restart, pairing MUST still be pending_tiebreaker
      const tourneyAfterReboot = (await repository.load(tournamentId))!;
      const rebootPairing = getAllTournamentPairings(tourneyAfterReboot).find(p => p.pairingId === koPairing.pairingId)!;
      expect(rebootPairing.status).toBe('pending_tiebreaker');
      expect(rebootPairing.tiebreakerStatus).toBe('pending');

      // Resolve tiebreaker
      const resolveRes = await rebootManager.resolveTiebreaker(
        tournamentId,
        koPairing.pairingId,
        'A',
        'Head-to-head tiebreaker by tournament referee',
        'referee-bob'
      );
      expect(resolveRes.success).toBe(true);

      // Verify audit log in metadata
      const resolvedTourney = resolveRes.data!;
      expect(resolvedTourney.metadata?.tiebreakerAudit).toBeDefined();
      const auditLog = resolvedTourney.metadata!.tiebreakerAudit as any[];
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]!.pairingId).toBe(koPairing.pairingId);
      expect(auditLog[0]!.winner).toBe('A');
      expect(auditLog[0]!.resolvedBy).toBe('referee-bob');
      expect(auditLog[0]!.reason).toBe('Head-to-head tiebreaker by tournament referee');

      // Idempotent re-resolution with same winner succeeds
      const idempotentRes = await rebootManager.resolveTiebreaker(
        tournamentId,
        koPairing.pairingId,
        'A',
        'Duplicate call'
      );
      expect(idempotentRes.success).toBe(true);

      // Conflicting resolution with different winner fails
      const conflictRes = await rebootManager.resolveTiebreaker(
        tournamentId,
        koPairing.pairingId,
        'B',
        'Conflicting decision'
      );
      expect(conflictRes.success).toBe(false);
      expect(conflictRes.error).toContain('conflicting winner');
    });
  });

  describe('4. Stale State Rollback & Authoritative Match Record Recovery', () => {
    it('hierarchically recovers multi-round committed match records when tournament.json is restored to an earlier snapshot', async () => {
      const executor = new DurabilityMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 16; // 16 bots -> Group Stage (4 groups of 4) -> Knockout (8 bots: QF, SF, Final)
      const tournamentId = 't-rollback-recovery-16';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Rollback Recovery Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      // 1. Run all Group Stage matches
      while (true) {
        const t = (await repository.load(tournamentId))!;
        const groupStage = t.stages!.find(s => s.stageType === 'group_stage')!;
        if (groupStage.status === 'completed') break;
        await manager.runNextMatch(tournamentId);
      }

      // Snapshot tournament state at the start of Knockout stage
      const snapshotAtKnockoutStart = await repository.load(tournamentId);
      const koStageAtStart = snapshotAtKnockoutStart!.stages!.find(s => s.stageType === 'knockout')!;
      expect(koStageAtStart.status).toBe('in_progress');

      // 2. Run Knockout Round 1 (Quarter-Finals: 4 matches)
      const tourneyAtKO = (await repository.load(tournamentId))!;
      const qfPairings = tourneyAtKO.stages![1]!.rounds![0]!.pairings;
      expect(qfPairings).toHaveLength(4);

      for (const p of qfPairings) {
        await manager.runPairingById(tournamentId, p.pairingId);
      }

      // 3. Run Knockout Round 2 (Semi-Finals: 2 matches)
      const tourneyAtSF = (await repository.load(tournamentId))!;
      const sfPairings = tourneyAtSF.stages![1]!.rounds![1]!.pairings;
      expect(sfPairings).toHaveLength(2);

      for (const p of sfPairings) {
        await manager.runPairingById(tournamentId, p.pairingId);
      }

      // At this point, QF and SF matches are durably written to disk in match-<matchId>.json
      const matchRecordsOnDisk = await repository.listMatchResults(tournamentId);
      // Group matches (4 groups * 6 matches = 24) + QF (4) + SF (2) = 30 matches
      expect(matchRecordsOnDisk.length).toBe(30);

      // 4. SIMULATE STALE SNAPSHOT ROLLBACK:
      // Overwrite tournament.json with snapshotAtKnockoutStart (where QF and SF pairings are still scheduled with placeholder slots!)
      await repository.save(snapshotAtKnockoutStart!);

      const rolledBackTourney = (await repository.load(tournamentId))!;
      const rolledBackQF = rolledBackTourney.stages![1]!.rounds![0]!.pairings;
      expect(rolledBackQF[0]!.status).toBe('scheduled'); // Reverted!

      // 5. SERVER RESTART & RECOVERY:
      const recoveryManager = new TournamentManager({
        repository,
        executor: new DurabilityMockExecutor(),
        enableMultiStage: true,
      });

      // Recover interrupted tournament from authoritative match records
      const recovered = await recoveryManager.recoverInterruptedTournaments();
      expect(recovered).toBe(1);

      // 6. Verify that both QF and SF matches and all winner slots were hierarchically recovered!
      const recoveredTourney = (await repository.load(tournamentId))!;
      const koStage = recoveredTourney.stages![1]!;

      // QF pairings must all be completed
      for (const p of koStage.rounds![0]!.pairings) {
        expect(p.status).toBe('completed');
        expect(p.matchResult).toBeDefined();
      }

      // SF pairings must all be completed
      for (const p of koStage.rounds![1]!.pairings) {
        expect(p.status).toBe('completed');
        expect(p.matchResult).toBeDefined();
      }

      // Final pairing (Round 3) slots must be resolved with concrete bot IDs (no placeholders!)
      const finalPairing = koStage.rounds![2]!.pairings[0]!;
      expect(finalPairing.status).toBe('scheduled');
      expect(isSlotPlaceholder(finalPairing.participantA)).toBe(false);
      expect(isSlotPlaceholder(finalPairing.participantB)).toBe(false);

      // 7. Complete the final match
      const finalRun = await recoveryManager.runAllMatches(tournamentId);
      expect(finalRun.success).toBe(true);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
      expect(finalTourney.stages![1]!.advancement.advancingParticipantIds).toHaveLength(1);
    });
  });
});
