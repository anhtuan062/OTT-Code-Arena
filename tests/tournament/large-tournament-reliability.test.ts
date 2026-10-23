/**
 * Phase 3D: Large Tournament Reliability Test
 *
 * Validates Multi-Stage Reliability at Scale using Mock Executor (no Docker):
 * 1. 256-Bot Full Tournament Lifecycle:
 *    - Regional Qualifiers (4 regions) -> Group Stage (32 groups) -> Knockout (64 bots) -> Champion.
 *    - Standings, advancement, and winner-slot resolution.
 *    - Measured throughput (matches/sec), lifecycle time, save/load counts, and memory usage.
 *    - Zero lost results, zero re-execution of committed matches, no early stage unlock.
 * 2. Stage Isolation & Progression Guards:
 *    - Independent progress across 4 regions.
 *    - Strict barriers: Group Stage remains pending until all 4 regions complete.
 *    - Knockout Stage remains pending until all 32 groups complete.
 * 3. Fault Injection, Pause/Resume & Persistence Boundaries:
 *    - Pause & resume via AbortSignal mid-tournament.
 *    - Server restart mid-execution and recovery of in-progress pairings.
 *    - Recovery when crash happens between match result commit and tournament state persistence.
 * 4. Idempotency, Concurrency & Elimination Draw / Tiebreaker:
 *    - Idempotent re-commits in commitMatchResultAndResolveSlots.
 *    - Conflicting result detection.
 *    - Duplicate concurrent execution prevention.
 *    - Elimination draw handling (pending_tiebreaker, UNRESOLVED_DRAW, no infinite retry loop, manual resolveTiebreaker).
 * 5. 1024-Bot Scale Planning & Persistence Verification:
 *    - Auto-format planner verification (896 prelim + 192 group + 63 knockout = 1,151 total matches).
 *    - Multi-stage model creation, structural validation, serialization boundedness, and disk persistence round-trip.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  TournamentFormat,
  TournamentParticipant,
  TournamentBot,
  TournamentPairing,
  TournamentMatchRecord,
  FileTournamentRepository,
} from '../../tournament/index.js';
import type { MatchExecutor } from '../../tournament/executor.js';
import type { MatchResult, MatchReplay, BotDefinition, MatchConfig } from '@match-runner/types.js';
import { calculateTournamentFormat } from '../../tournament/auto-format.js';
import {
  createMultiStageTournament,
  getAllTournamentPairings,
  getExecutablePairings,
  isTournamentComplete,
  validateMultiStageTournament,
  commitMatchResultAndResolveSlots,
  isSlotPlaceholder,
} from '../../tournament/multi-stage.js';

// Instrumented File Repository to track persistence metrics
class InstrumentedFileRepository extends FileTournamentRepository {
  public saveCount = 0;
  public loadCount = 0;
  public saveMatchResultCount = 0;
  public loadMatchResultCount = 0;
  public listMatchResultsCount = 0;

  override async save(tournament: any): Promise<void> {
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

// Reliable mock executor with execution telemetry
class TrackingMockExecutor implements MatchExecutor {
  public executedMatches: string[] = [];
  public customOutcomes = new Map<string, 'A' | 'B' | 'draw'>();
  public activeConcurrency = 0;
  public peakConcurrency = 0;

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

    this.activeConcurrency++;
    this.peakConcurrency = Math.max(this.peakConcurrency, this.activeConcurrency);
    this.executedMatches.push(matchId);

    // Determine outcome (default: lower botId wins deterministically)
    const outcome = this.customOutcomes.get(matchId) ?? (playerA.botId < playerB.botId ? 'A' : 'B');

    const result: MatchResult = {
      matchId,
      protocolVersion: '0.1.0',
      status: 'finished',
      winner: outcome,
      terminationReason: 'goal_reached' as any,
      turnCount: 12,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 5,
      playerA: { botId: playerA.botId, player: 'A', command: 'mock', args: [] },
      playerB: { botId: playerB.botId, player: 'B', command: 'mock', args: [] },
      finalState: {
        turn: 12,
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

    this.activeConcurrency--;
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

describe('Phase 3D - Large Tournament Reliability Test', () => {
  let tempDir: string;
  let repository: InstrumentedFileRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `ott-p3d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(tempDir, { recursive: true });
    repository = new InstrumentedFileRepository({ baseDir: tempDir });
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

  describe('1. 256-Bot Full Tournament Reliability & Telemetry', () => {
    it('executes 256-bot multi-stage tournament end-to-end with metrics, zero lost results, and zero duplicates', async () => {
      const executor = new TrackingMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-256-reliability';
      const participants = createDummyParticipants(count);

      // Create tournament
      const createRes = await manager.createTournament(tournamentId, '256 Bot Reliability Arena', 'multi_stage');
      expect(createRes.success).toBe(true);

      // Seed participants
      const loadedDraft = (await repository.load(tournamentId))!;
      loadedDraft.participants = participants;
      loadedDraft.status = 'registration_closed';
      await repository.save(loadedDraft);

      // Measure memory and time
      const initialMem = process.memoryUsage();
      const startTime = Date.now();

      // Generate schedule
      const schedRes = await manager.generateSchedule(tournamentId);
      expect(schedRes.success).toBe(true);
      const scheduledTourney = schedRes.data!;

      // Verify initial multi-stage structure
      expect(scheduledTourney.stages).toHaveLength(3);
      const [prelimStage, groupStage, koStage] = scheduledTourney.stages!;
      expect(prelimStage?.stageType).toBe('preliminary');
      expect(prelimStage?.status).toBe('in_progress');
      expect(prelimStage?.regions).toHaveLength(4);

      expect(groupStage?.stageType).toBe('group_stage');
      expect(groupStage?.status).toBe('pending');
      expect(groupStage?.groups).toHaveLength(32);

      expect(koStage?.stageType).toBe('knockout');
      expect(koStage?.status).toBe('pending');
      expect(koStage?.rounds).toHaveLength(6); // R64, R32, R16, QF, SF, Final

      // Start tournament
      const startRes = await manager.startTournament(tournamentId);
      expect(startRes.success).toBe(true);

      // Reset repository counters before execution to measure exact lifecycle traffic
      const saveCountBeforeRun = repository.saveCount;
      const loadCountBeforeRun = repository.loadCount;
      const matchSaveBeforeRun = repository.saveMatchResultCount;

      // Execute all matches
      const runRes = await manager.runAllMatches(tournamentId);
      expect(runRes.success).toBe(true);

      const endTime = Date.now();
      const finalMem = process.memoryUsage();
      const durationMs = endTime - startTime;
      const executedMatches = executor.executedMatches;

      // Telemetry & metrics calculation
      const totalMatches = executedMatches.length;
      const throughput = (totalMatches / (durationMs / 1000)).toFixed(2);
      const heapDeltaMB = ((finalMem.heapUsed - initialMem.heapUsed) / (1024 * 1024)).toFixed(2);

      console.log(`[Phase 3D Metrics - 256 Bot Tournament]`);
      console.log(`Total Matches Executed: ${totalMatches}`);
      console.log(`Lifecycle Duration: ${durationMs}ms`);
      console.log(`Throughput: ${throughput} matches/sec`);
      console.log(`Tournament Saves: ${repository.saveCount - saveCountBeforeRun}`);
      console.log(`Tournament Loads: ${repository.loadCount - loadCountBeforeRun}`);
      console.log(`Match Result Writes: ${repository.saveMatchResultCount - matchSaveBeforeRun}`);
      console.log(`Heap Used Delta: ${heapDeltaMB} MB`);
      console.log(`Peak Concurrency: ${executor.peakConcurrency}`);

      // The planner creates 383 series (128 prelim + 192 group + 63 knockout).
      // The executor telemetry records individual games; decisive BO2/BO3
      // series stop after two games in this deterministic fixture.
      expect(totalMatches).toBe(766);
      expect(executor.peakConcurrency).toBe(1); // Pull-based sequential execution

      // Verification: Zero duplicate match executions
      const uniqueExecutedMatches = new Set(executedMatches);
      expect(uniqueExecutedMatches.size).toBe(766);

      // Verification: Zero lost results in repository
      const savedMatchRecords = await repository.listMatchResults(tournamentId);
      expect(savedMatchRecords.length).toBe(383);

      // Reload completed tournament from persistence
      const completedTourney = (await repository.load(tournamentId))!;
      expect(completedTourney.status).toBe('completed');
      expect(completedTourney.completedAt).toBeTruthy();
      expect(isTournamentComplete(completedTourney)).toBe(true);

      // All 3 stages completed
      const [finalPrelim, finalGroup, finalKo] = completedTourney.stages!;
      expect(finalPrelim?.status).toBe('completed');
      expect(finalGroup?.status).toBe('completed');
      expect(finalKo?.status).toBe('completed');

      // 4 regions each qualified 32 bots -> 128 total qualifiers
      for (const region of finalPrelim!.regions!) {
        expect(region.status).toBe('completed');
        expect(region.advancingParticipantIds.length).toBe(32);
      }
      expect(finalPrelim!.advancement.advancingParticipantIds.length).toBe(128);

      // 32 groups each produced standings and top 2 advanced -> 64 bots to Knockout
      for (const group of finalGroup!.groups!) {
        expect(group.status).toBe('completed');
        expect(group.standings.length).toBe(4);
        expect(group.standings[0]?.points).toBeGreaterThanOrEqual(group.standings[1]?.points);
        expect(group.standings[1]?.points).toBeGreaterThanOrEqual(group.standings[2]?.points);
        expect(group.standings[2]?.points).toBeGreaterThanOrEqual(group.standings[3]?.points);
      }
      expect(finalGroup!.advancement.advancingParticipantIds.length).toBe(64);

      // Knockout crowned exactly 1 champion matching final match winner
      expect(finalKo!.advancement.advancingParticipantIds.length).toBe(1);
      const championId = finalKo!.advancement.advancingParticipantIds[0]!;
      expect(championId).toBeTruthy();

      const finalMatch = finalKo!.rounds![finalKo!.rounds!.length - 1]!.pairings[0]!;
      const expectedChampion = finalMatch.matchResult?.winner === 'A' ? finalMatch.participantA : finalMatch.participantB;
      expect(championId).toBe(expectedChampion);

      // Standings exist and contain all 256 participants
      expect(completedTourney.standings).toBeDefined();
      expect(completedTourney.standings.length).toBe(256);
      expect(completedTourney.standings[0]?.participantId).toBe(championId);
    }, 120_000);
  });

  describe('2. Independent Regional Qualifiers & Stage Barrier Synchronization', () => {
    it('maintains independent region progress and prevents early Group Stage or Knockout unlocking', async () => {
      const executor = new TrackingMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-barrier-sync';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Barrier Sync Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      const tourney = (await repository.load(tournamentId))!;
      const prelimStage = tourney.stages![0]!;
      expect(prelimStage.regions).toHaveLength(4);

      // Execute all 32 pairings of Region 1 only
      const reg1 = prelimStage.regions![0]!;
      const reg1Pairings = reg1.rounds.flatMap(r => r.pairings);
      expect(reg1Pairings.length).toBe(32);

      for (const p of reg1Pairings) {
        const res = await manager.runPairingById(tournamentId, p.pairingId);
        expect(res.success).toBe(true);
      }

      // Reload tournament to inspect intermediate barrier state
      const midTourney = (await repository.load(tournamentId))!;
      const midPrelim = midTourney.stages![0]!;
      const midGroup = midTourney.stages![1]!;

      // Region 1 is complete and has 32 qualifiers
      const midReg1 = midPrelim.regions![0]!;
      expect(midReg1.status).toBe('completed');
      expect(midReg1.advancingParticipantIds).toHaveLength(32);

      // Regions 2, 3, 4 are still incomplete
      expect(midPrelim.regions![1]!.status).not.toBe('completed');
      expect(midPrelim.regions![2]!.status).not.toBe('completed');
      expect(midPrelim.regions![3]!.status).not.toBe('completed');

      // Preliminary stage is NOT yet complete
      expect(midPrelim.status).toBe('in_progress');

      // Group stage MUST remain pending and have zero executable pairings
      expect(midGroup.status).toBe('pending');
      const executablePairings = getExecutablePairings(midTourney);
      expect(executablePairings.every(p => p.stageId === 'stage-preliminary')).toBe(true);

      // Group stage slots for Region 1 are NOT prematurely resolved
      const allGroupPairings = midGroup.groups!.flatMap(g => g.rounds.flatMap(r => r.pairings));
      for (const gp of allGroupPairings) {
        expect(isSlotPlaceholder(gp.participantA)).toBe(true);
        expect(isSlotPlaceholder(gp.participantB)).toBe(true);
      }

      // Finish remaining regions via runAllMatches
      const finishRes = await manager.runAllMatches(tournamentId);
      expect(finishRes.success).toBe(true);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
    }, 120_000);
  });

  describe('3. Fault Injection, Pause/Resume, and Persistence Boundaries', () => {
    it('aborts cleanly via AbortSignal mid-tournament and resumes without corruption', async () => {
      const executor = new TrackingMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-pause-resume-256';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Pause Resume Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      // Run partial tournament (abort after 100 matches)
      const controller = new AbortController();
      let matchCounter = 0;
      const originalExecute = executor.executeMatch.bind(executor);
      executor.executeMatch = async (...args) => {
        matchCounter++;
        if (matchCounter >= 100) {
          controller.abort();
        }
        return originalExecute(...args);
      };

      const abortedResult = await manager.runAllMatches(tournamentId, controller.signal);
      expect(abortedResult.success).toBe(false);
      expect(abortedResult.error).toContain('cancelled');

      // Verify tournament state remains running
      const pausedTourney = (await repository.load(tournamentId))!;
      expect(pausedTourney.status).toBe('running');

      // Restore normal executor and resume
      executor.executeMatch = originalExecute;
      const resumeRes = await manager.resumeTournament(tournamentId);
      expect(resumeRes.success).toBe(true);

      // Complete remaining matches
      const completeRes = await manager.runAllMatches(tournamentId);
      expect(completeRes.success).toBe(true);

      // Exactly 383 total matches executed, 0 duplicates
      expect(executor.executedMatches.length).toBe(383);
      expect(new Set(executor.executedMatches).size).toBe(383);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
      expect(isTournamentComplete(finalTourney)).toBe(true);
    }, 120_000);

    it('recovers from server restart when a pairing was interrupted mid-flight', async () => {
      const executor1 = new TrackingMockExecutor();
      const manager1 = new TournamentManager({
        repository,
        executor: executor1,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-crash-restart-256';
      const participants = createDummyParticipants(count);

      await manager1.createTournament(tournamentId, 'Crash Restart Arena', 'multi_stage', { bestOf: 1 });
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager1.generateSchedule(tournamentId);
      await manager1.startTournament(tournamentId);

      // Execute 40 matches one-by-one
      for (let i = 0; i < 40; i++) {
        await manager1.runNextMatch(tournamentId);
      }
      expect(executor1.executedMatches.length).toBe(40);

      // Simulate a crash mid-flight: pairing is marked in_progress on disk without a completed match record
      const crashedTourney = (await repository.load(tournamentId))!;
      const nextPairing = getAllTournamentPairings(crashedTourney).find(p => p.status === 'scheduled')!;
      nextPairing.status = 'in_progress';
      nextPairing.matchId = `${tournamentId}-${nextPairing.pairingId}`;
      nextPairing.startedAt = new Date().toISOString();
      await repository.save(crashedTourney);

      // Simulate server reboot: new manager instance pointing to the same repository
      const executor2 = new TrackingMockExecutor();
      const manager2 = new TournamentManager({
        repository,
        executor: executor2,
        enableMultiStage: true,
      });

      // Run recovery
      const recoveredCount = await manager2.recoverInterruptedTournaments();
      expect(recoveredCount).toBe(1);

      // The interrupted pairing should be reset to scheduled
      const postRecoveryTourney = (await repository.load(tournamentId))!;
      const recoveredPairing = getAllTournamentPairings(postRecoveryTourney).find(p => p.pairingId === nextPairing.pairingId)!;
      expect(recoveredPairing.status).toBe('scheduled');
      expect(recoveredPairing.matchId).toBeNull();

      // Finish tournament with manager2
      const finishRes = await manager2.runAllMatches(tournamentId);
      expect(finishRes.success).toBe(true);

      // Total executed matches across both managers = 40 (manager1) + 343 (manager2) = 383
      expect(executor1.executedMatches.length + executor2.executedMatches.length).toBe(383);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
    }, 45_000);

    it('reconciles committed match result when process crashes before tournament state save', async () => {
      const executor = new TrackingMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-persistence-boundary';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Persistence Boundary Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      // Run 30 matches
      for (let i = 0; i < 30; i++) {
        await manager.runNextMatch(tournamentId);
      }

      // Inject crash: simulate that pairing 31 had its match result persisted to disk,
      // but the process crashed before saving the tournament state.
      const tourney = (await repository.load(tournamentId))!;
      const pairing31 = getAllTournamentPairings(tourney).find(p => p.status === 'scheduled')!;
      const matchId31 = `${tournamentId}-${pairing31.pairingId}`;

      const fakeRecord: TournamentMatchRecord = {
        matchId: matchId31,
        pairingId: pairing31.pairingId,
        participantA: pairing31.participantA,
        participantB: pairing31.participantB,
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 15,
        durationMs: 20,
        replayRef: matchId31,
        completedAt: new Date().toISOString(),
      };
      await repository.saveMatchResult(tournamentId, matchId31, fakeRecord, { matchId: matchId31 });

      // Simulate crash and reboot
      const rebootManager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const recoveredCount = await rebootManager.recoverInterruptedTournaments();
      expect(recoveredCount).toBe(1);

      // Verify that pairing 31 was recognized as completed from authoritative disk match record
      const reconciledTourney = (await repository.load(tournamentId))!;
      const recPairing31 = getAllTournamentPairings(reconciledTourney).find(p => p.pairingId === pairing31.pairingId)!;
      expect(recPairing31.status).toBe('completed');
      expect(recPairing31.matchResult?.winner).toBe('A');

      // Finish remainder
      const finishRes = await rebootManager.runAllMatches(tournamentId);
      expect(finishRes.success).toBe(true);

      const finalState = (await repository.load(tournamentId))!;
      expect(finalState.status).toBe('completed');
    }, 45_000);
  });

  describe('4. Idempotency, Concurrency & Elimination Tiebreaker', () => {
    it('verifies commit idempotency and detects conflicting results', async () => {
      const count = 256;
      const tournamentId = 'tourney-idempotency-test';
      const participants = createDummyParticipants(count);

      const multiStage = createMultiStageTournament({
        tournamentId,
        name: 'Idempotency Test',
        participants,
      });

      const firstPairing = getAllTournamentPairings(multiStage)[0]!;
      const record: TournamentMatchRecord = {
        matchId: 'm-idemp-1',
        pairingId: firstPairing.pairingId,
        participantA: firstPairing.participantA,
        participantB: firstPairing.participantB,
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        durationMs: 50,
        replayRef: 'm-idemp-1',
        completedAt: new Date().toISOString(),
      };

      // 1. First commit: advances slots
      const commit1 = commitMatchResultAndResolveSlots(multiStage, firstPairing.pairingId, record);
      expect(commit1.resolvedCount).toBeGreaterThanOrEqual(0);

      // 2. Idempotent second commit with identical result: returns 0 resolved, no error
      const commit2 = commitMatchResultAndResolveSlots(multiStage, firstPairing.pairingId, record);
      expect(commit2.resolvedCount).toBe(0);

      // 3. Conflicting commit with winner 'B': throws Error
      const conflictingRecord: TournamentMatchRecord = {
        ...record,
        matchId: 'm-conflicting-1',
        winner: 'B',
      };
      expect(() => commitMatchResultAndResolveSlots(multiStage, firstPairing.pairingId, conflictingRecord))
        .toThrow(/conflicting result/i);
    });

    it('rejects duplicate concurrent execution of the same pairing', async () => {
      let resolveMatchExecution: (() => void) | null = null;
      let matchStartedResolve: (() => void) | null = null;
      const matchStartedPromise = new Promise<void>(resolve => {
        matchStartedResolve = resolve;
      });

      const slowExecutor: MatchExecutor = {
        async executeMatch(matchId, pA, pB) {
          matchStartedResolve?.();
          await new Promise<void>(resolve => {
            resolveMatchExecution = resolve;
          });
          return {
            matchId,
            protocolVersion: '0.1.0',
            status: 'finished',
            winner: 'A',
            terminationReason: 'goal_reached' as any,
            turnCount: 5,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 10,
            playerA: { botId: pA.botId, player: 'A', command: 'mock', args: [] },
            playerB: { botId: pB.botId, player: 'B', command: 'mock', args: [] },
            finalState: {} as any,
            turnLog: [],
            initialState: {} as any,
          };
        },
      };

      const manager = new TournamentManager({
        repository,
        executor: slowExecutor,
        enableMultiStage: true,
      });

      const count = 8;
      const tournamentId = 'tourney-concurrent-lock';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Concurrent Lock Arena', 'multi_stage');
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);
      const tourney = (await repository.load(tournamentId))!;
      const firstPairing = getAllTournamentPairings(tourney)[0]!;

      // Launch call1 and call2 concurrently for the exact same pairing
      const p1 = manager.runPairingById(tournamentId, firstPairing.pairingId);
      const p2 = manager.runPairingById(tournamentId, firstPairing.pairingId);

      // Wait until the first call enters executeMatch and unblock it
      await matchStartedPromise;
      resolveMatchExecution?.();

      // Await both calls
      const [res1, res2] = await Promise.all([p1, p2]);

      // Exactly one must succeed, and exactly one must fail
      const successResults = [res1, res2].filter(r => r.success);
      const failedResults = [res1, res2].filter(r => !r.success);

      expect(successResults.length).toBe(1);
      expect(failedResults.length).toBe(1);
      expect(failedResults[0]!.error).toMatch(/already being executed|not in scheduled state/i);
    }, 120_000);

    it('handles elimination draw with pending_tiebreaker, halts infinite loop, and resumes on resolveTiebreaker', async () => {
      const executor = new TrackingMockExecutor();
      const manager = new TournamentManager({
        repository,
        executor,
        enableMultiStage: true,
      });

      const count = 256;
      const tournamentId = 'tourney-tiebreaker-elim';
      const participants = createDummyParticipants(count);

      await manager.createTournament(tournamentId, 'Tiebreaker Arena', 'multi_stage', { bestOf: 1 });
      const loaded = (await repository.load(tournamentId))!;
      loaded.participants = participants;
      loaded.status = 'registration_closed';
      await repository.save(loaded);

      await manager.generateSchedule(tournamentId);
      await manager.startTournament(tournamentId);

      const tourney = (await repository.load(tournamentId))!;
      const firstPairing = getAllTournamentPairings(tourney)[0]!;
      const matchId = `${tournamentId}-${firstPairing.pairingId}`;

      // Force first match (preliminary elimination) to end in draw
      executor.setOutcome(matchId, 'draw');

      // Run pairing directly
      const runRes = await manager.runPairingById(tournamentId, firstPairing.pairingId);
      expect(runRes.success).toBe(false);
      expect(runRes.error).toContain('tiebreaker pending');

      // Verify pairing status is pending_tiebreaker
      const midTourney = (await repository.load(tournamentId))!;
      const midPairing = getAllTournamentPairings(midTourney).find(p => p.pairingId === firstPairing.pairingId)!;
      expect(midPairing.status).toBe('pending_tiebreaker');
      expect(midPairing.failureCode).toBe('UNRESOLVED_DRAW');
      expect(midPairing.tiebreakerStatus).toBe('pending');

      // runAllMatches must NOT loop infinitely; it stops and reports tiebreaker requirement
      const runAllRes = await manager.runAllMatches(tournamentId);
      expect(runAllRes.success).toBe(false);
      expect(runAllRes.error).toContain('tiebreaker resolution');

      // Resolve tiebreaker manually
      const resolveRes = await manager.resolveTiebreaker(
        tournamentId,
        firstPairing.pairingId,
        'A',
        'Head-to-head referee decision'
      );
      expect(resolveRes.success).toBe(true);

      const resolvedTourney = (await repository.load(tournamentId))!;
      const resolvedPairing = getAllTournamentPairings(resolvedTourney).find(p => p.pairingId === firstPairing.pairingId)!;
      expect(resolvedPairing.status).toBe('completed');
      expect(resolvedPairing.tiebreakerStatus).toBe('resolved');
      expect(resolvedTourney.metadata?.tiebreakerAudit).toBeDefined();

      // Now runAllMatches executes to completion
      const finishRes = await manager.runAllMatches(tournamentId);
      expect(finishRes.success).toBe(true);

      const finalTourney = (await repository.load(tournamentId))!;
      expect(finalTourney.status).toBe('completed');
    }, 45_000);
  });

  describe('5. 1024-Bot Scale Planning & Persistence Verification', () => {
    it('verifies 1024-bot format planning, multi-stage structure, serialization size, and disk round-trip', async () => {
      const count = 1024;
      const participants = createDummyParticipants(count);

      // Measure format planning time
      const planStart = Date.now();
      const plan = calculateTournamentFormat(participants);
      const planDurationMs = Date.now() - planStart;

      console.log(`[Phase 3D - 1024 Bot Planning Time: ${planDurationMs}ms]`);
      expect(planDurationMs).toBeLessThan(300);

      // Validate exact 1024 bot math
      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.totalIncomingBots).toBe(1024);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);
      // 4 regions * 224 matches (128 + 64 + 32) = 896 matches
      expect(plan.regionalPlan?.totalMatches).toBe(896);

      // Group stage: 128 qualifiers into 32 groups of 4 bots = 192 matches
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);

      // Knockout: 64 bots (top 2 from 32 groups) = 63 matches
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);

      // Total matches: 896 + 192 + 63 = 1151
      expect(plan.totalDockerMatches).toBe(1151);

      // Create multi-stage model
      const createStart = Date.now();
      const multiStage1024 = createMultiStageTournament({
        tournamentId: 'tourney-1024-scale',
        name: '1024 Bot Championship',
        participants,
      });
      const createDurationMs = Date.now() - createStart;
      console.log(`[Phase 3D - 1024 Bot Creation Time: ${createDurationMs}ms]`);
      expect(createDurationMs).toBeLessThan(500);

      // Validate multi-stage invariants
      const validation = validateMultiStageTournament(multiStage1024);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      // Verify single source of truth
      expect(multiStage1024.rounds).toEqual([]);
      expect(multiStage1024.stages).toHaveLength(3);

      // Verify total pairings count
      const allPairings = getAllTournamentPairings(multiStage1024);
      const playablePairings = allPairings.filter(p => p.participantB !== null);
      expect(playablePairings.length).toBe(1151);

      // Initial executable pairings: only Round 1 of the 4 Regional Qualifiers (128 matches per region * 4 regions = 512 matches)
      const initialExec = getExecutablePairings(multiStage1024);
      expect(initialExec.length).toBe(512);
      expect(initialExec.every(p => p.stageId === 'stage-preliminary')).toBe(true);

      // Serialization size check (< 1.5 MB)
      const jsonStr = JSON.stringify(multiStage1024);
      const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
      const sizeMB = sizeBytes / (1024 * 1024);
      console.log(`[Phase 3D - 1024 Bot Serialized Size: ${sizeMB.toFixed(2)} MB (${sizeBytes} bytes)]`);
      expect(sizeMB).toBeLessThan(1.5);

      // Persist to disk
      const saveStart = Date.now();
      await repository.save(multiStage1024);
      const saveDurationMs = Date.now() - saveStart;
      console.log(`[Phase 3D - 1024 Bot Save Time: ${saveDurationMs}ms]`);

      // Reload from disk and verify structural integrity
      const loadStart = Date.now();
      const loaded1024 = await repository.load('tourney-1024-scale');
      const loadDurationMs = Date.now() - loadStart;
      console.log(`[Phase 3D - 1024 Bot Load Time: ${loadDurationMs}ms]`);

      expect(loaded1024).toBeDefined();
      expect(loaded1024!.participants.length).toBe(1024);
      expect(loaded1024!.stages).toHaveLength(3);

      const reloadedPairings = getAllTournamentPairings(loaded1024!);
      expect(reloadedPairings.filter(p => p.participantB !== null).length).toBe(1151);

      const reloadedValidation = validateMultiStageTournament(loaded1024!);
      expect(reloadedValidation.valid).toBe(true);
      expect(reloadedValidation.errors).toEqual([]);
    }, 15_000);
  });
});
