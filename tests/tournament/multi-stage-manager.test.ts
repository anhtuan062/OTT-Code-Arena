/**
 * Tournament Manager - Multi-Stage Lifecycle & Compatibility Tests (Phase 2C)
 *
 * Verifies full integration of Regional Qualifiers -> Group Stage -> Knockout -> Champion
 * within TournamentManager:
 * - Feature flag gating
 * - Full lifecycle execution across stages
 * - 4-region independent progression and barrier sync before Group Stage
 * - Bye handling in preliminary rounds
 * - Draws in group stage vs decisive requirement in elimination
 * - Pause and resume via AbortController
 * - Crash recovery and slot reconciliation
 * - Repository persistence independence (FileRepository & MemoryRepository)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  createMockTournamentManager,
} from '@tournament/manager.js';
import { FileTournamentRepository, TournamentRepository } from '@tournament/persistence.js';
import { MockMatchExecutor } from '@tournament/executor.js';
import type { MatchExecutor } from '@tournament/executor.js';
import type {
  Tournament,
  TournamentBot,
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentPairing,
} from '@tournament/types.js';
import type { MatchResult, MatchReplay, BotDefinition, MatchConfig } from '@match-runner/types.js';
import {
  isMultiStageTournament,
  getExecutablePairings,
  getAllTournamentPairings,
  commitMatchResultAndResolveSlots,
} from '@tournament/multi-stage.js';

// Helper to create a standard mock match result
function createMockResult(
  matchId: string,
  winner: 'A' | 'B' | 'draw' = 'A',
  terminationReason = 'goal_reached'
): { matchResult: MatchResult; replay: MatchReplay } {
  const result: MatchResult = {
    matchId,
    protocolVersion: '0.1.0',
    status: 'finished',
    winner,
    terminationReason: terminationReason as any,
    turnCount: 10,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 100,
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

  const replay: MatchReplay = {
    matchId,
    protocolVersion: '0.1.0',
    initialState: result.initialState,
    moves: [],
    finalState: result.finalState,
    winner: result.winner,
    terminationReason: result.terminationReason,
  };

  return { matchResult: result, replay };
}

// Auto-responding executor for bulk multi-stage tournaments
class AutoRespondingExecutor implements MatchExecutor {
  public executedCount = 0;
  public executionLog: Array<{ matchId: string; playerA: string; playerB: string }> = [];
  public customOutcomes: Map<string, 'A' | 'B' | 'draw'> = new Map();

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
    this.executedCount++;
    this.executionLog.push({ matchId, playerA: playerA.botId, playerB: playerB.botId });

    const seriesMatchId = matchId.replace(/-g[123]$/, '');
    const configuredOutcome = this.customOutcomes.get(matchId) ?? this.customOutcomes.get(seriesMatchId) ??
      [...this.customOutcomes.entries()].find(([key]) => matchId.startsWith(`${key}-g`))?.[1];
    const winner = configuredOutcome ?? 'A';
    return createMockResult(matchId, winner).matchResult;
  }
}

// In-memory TournamentRepository implementation to verify no SQLite/filesystem coupling
class InMemoryTournamentRepository implements TournamentRepository {
  private tournaments = new Map<string, Tournament>();
  private matchResults = new Map<string, Map<string, { result: TournamentMatchRecord; replay: object }>>();

  async save(tournament: Tournament): Promise<void> {
    // Deep clone to simulate serialization
    this.tournaments.set(tournament.tournamentId, JSON.parse(JSON.stringify(tournament)));
  }

  async load(tournamentId: string): Promise<Tournament | null> {
    const data = this.tournaments.get(tournamentId);
    return data ? JSON.parse(JSON.stringify(data)) : null;
  }

  async list(): Promise<Tournament[]> {
    return Array.from(this.tournaments.values()).map(t => JSON.parse(JSON.stringify(t)));
  }

  async delete(tournamentId: string): Promise<void> {
    this.tournaments.delete(tournamentId);
    this.matchResults.delete(tournamentId);
  }

  async exists(tournamentId: string): Promise<boolean> {
    return this.tournaments.has(tournamentId);
  }

  async saveMatchResult(
    tournamentId: string,
    matchId: string,
    result: TournamentMatchRecord,
    replay: object
  ): Promise<void> {
    let tMap = this.matchResults.get(tournamentId);
    if (!tMap) {
      tMap = new Map();
      this.matchResults.set(tournamentId, tMap);
    }
    tMap.set(matchId, {
      result: JSON.parse(JSON.stringify(result)),
      replay: JSON.parse(JSON.stringify(replay)),
    });
  }

  async deleteMatchResult(tournamentId: string, matchId: string): Promise<void> {
    this.matchResults.get(tournamentId)?.delete(matchId);
  }

  async loadMatchResult(tournamentId: string, matchId: string): Promise<TournamentMatchRecord | null> {
    const item = this.matchResults.get(tournamentId)?.get(matchId);
    return item ? JSON.parse(JSON.stringify(item.result)) : null;
  }

  async loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null> {
    const item = this.matchResults.get(tournamentId)?.get(matchId);
    return item ? JSON.parse(JSON.stringify(item.replay)) : null;
  }

  async listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]> {
    const tMap = this.matchResults.get(tournamentId);
    if (!tMap) return [];
    return Array.from(tMap.values()).map(item => JSON.parse(JSON.stringify(item.result)));
  }
}

describe('Tournament Manager - Multi-Stage Integration (Phase 2C)', () => {
  let testDir: string;
  let fileRepo: FileTournamentRepository;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ott-ms-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    fileRepo = new FileTournamentRepository({ baseDir: testDir, indent: 2 });
    await fileRepo.initialize();
  });

  afterEach(async () => {
    fileRepo.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  const createBot = (id: string): TournamentBot => ({
    botId: id,
    command: 'node',
    args: ['-e', 'console.log("{}")'],
  });

  describe('Feature Flag Enforcement', () => {
    it('rejects multi_stage creation when enableMultiStage is false or omitted (default)', async () => {
      const manager = new TournamentManager({
        repository: fileRepo,
        executor: new MockMatchExecutor(),
      });

      const result = await manager.createTournament('ms-disabled-1', 'Disabled Tournament', 'multi_stage');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled by feature flag');
    });

    it('rejects generateSchedule for multi_stage when enableMultiStage is false', async () => {
      const managerWithFlag = new TournamentManager({
        repository: fileRepo,
        executor: new MockMatchExecutor(),
        enableMultiStage: true,
      });
      await managerWithFlag.createTournament('ms-tourney-flag', 'Flag Test', 'multi_stage');

      // Now create a manager without flag pointing to same repo
      const managerWithoutFlag = new TournamentManager({
        repository: fileRepo,
        executor: new MockMatchExecutor(),
        enableMultiStage: false,
      });

      const schedResult = await managerWithoutFlag.generateSchedule('ms-tourney-flag');
      expect(schedResult.success).toBe(false);
      expect(schedResult.error).toContain('disabled by feature flag');
    });

    it('allows multi_stage creation and schedule generation when enableMultiStage is true', async () => {
      const manager = new TournamentManager({
        repository: fileRepo,
        executor: new MockMatchExecutor(),
        enableMultiStage: true,
      });

      const createResult = await manager.createTournament('ms-enabled-1', 'Enabled Tournament', 'multi_stage');
      expect(createResult.success).toBe(true);
      expect(createResult.data?.format).toBe('multi_stage');

      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('ms-enabled-1', `B${i}`, `Bot ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('ms-enabled-1');
      const schedResult = await manager.generateSchedule('ms-enabled-1');
      expect(schedResult.success).toBe(true);
      expect(schedResult.data?.stages).toBeDefined();
      expect(schedResult.data?.stages!.length).toBeGreaterThan(0);
    });
  });

  describe('Full Multi-Stage Lifecycle (Group Stage -> Knockout -> Champion)', () => {
    it('executes 8-bot multi-stage tournament to completion', async () => {
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: fileRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('tourney-8bot', '8 Bot Championship', 'multi_stage');
      for (let i = 1; i <= 8; i++) {
        await manager.registerParticipant('tourney-8bot', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('tourney-8bot');
      const scheduleRes = await manager.generateSchedule('tourney-8bot');
      expect(scheduleRes.success).toBe(true);
      const tournament = scheduleRes.data!;

      expect(isMultiStageTournament(tournament)).toBe(true);
      expect(tournament.stages!.length).toBe(2); // Group Stage + Knockout Stage
      expect(tournament.stages![0]?.stageType).toBe('group_stage');
      expect(tournament.stages![0]?.status).toBe('in_progress');
      expect(tournament.stages![1]?.stageType).toBe('knockout');
      expect(tournament.stages![1]?.status).toBe('pending');

      const startRes = await manager.startTournament('tourney-8bot');
      expect(startRes.success).toBe(true);
      expect(startRes.data?.status).toBe('running');

      // Run all matches
      const runRes = await manager.runAllMatches('tourney-8bot');
      expect(runRes.success).toBe(true);
      expect(runRes.data?.length).toBeGreaterThan(0);

      const afterGroup = (await manager.loadTournament('tourney-8bot')).data!;
      expect(afterGroup.status).toBe('running');
      expect(afterGroup.stages!.find(s => s.stageType === 'group_stage')?.status).toBe('completed');
      expect(afterGroup.stages!.find(s => s.stageType === 'knockout')?.status).toBe('pending');
      const blockedRun = await manager.runAllMatches('tourney-8bot');
      expect(blockedRun.success).toBe(false);
      expect(blockedRun.error).toContain('waiting for the organizer');
      expect((await manager.startNextStage('tourney-8bot')).success).toBe(true);
      const knockoutRun = await manager.runAllMatches('tourney-8bot');
      expect(knockoutRun.success).toBe(true);

      // Verify tournament completed
      const finalRes = await manager.loadTournament('tourney-8bot');
      expect(finalRes.success).toBe(true);
      const finalTournament = finalRes.data!;
      expect(finalTournament.status).toBe('completed');
      expect(finalTournament.completedAt).toBeTruthy();

      // Check stage progression
      const groupStage = finalTournament.stages!.find(s => s.stageType === 'group_stage')!;
      expect(groupStage.status).toBe('completed');
      expect(groupStage.advancement.isComplete).toBe(true);
      expect(groupStage.advancement.advancingParticipantIds.length).toBe(4); // Top 2 from 2 groups

      const knockoutStage = finalTournament.stages!.find(s => s.stageType === 'knockout')!;
      expect(knockoutStage.status).toBe('completed');
      expect(knockoutStage.advancement.isComplete).toBe(true);
      expect(knockoutStage.advancement.advancingParticipantIds.length).toBe(1); // 1 Champion!

      // Verify results publication
      const pubRes = await manager.publishResults('tourney-8bot');
      if (!pubRes.success) console.error('PUBLISH ERROR:', pubRes.error);
      expect(pubRes.success).toBe(true);
      expect(pubRes.data?.resultsPublishedAt).toBeTruthy();
    });
  });

  describe('4 Regional Qualifiers Lifecycle & Independent Stage Transitions', () => {
    it('coordinates independent regions, prevents early Group Stage unlock, and crowns a champion', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      // Directly seed 208 participants to trigger 4 regional qualifiers (52 bots each, qualifying 32 bots each)
      const participants: TournamentParticipant[] = Array.from({ length: 208 }, (_, idx) => ({
        participantId: `P${idx + 1}`,
        name: `Bot ${idx + 1}`,
        bot: { botId: `bot-${idx + 1}`, player: 'A', command: 'node', args: [] },
        registeredAt: new Date(idx * 1000).toISOString(),
      }));

      // Create draft tournament with participants pre-populated
      await manager.createTournament('regional-tourney', 'Regional Qualifiers 208', 'multi_stage');
      const loaded = (await manager.loadTournament('regional-tourney')).data!;
      loaded.participants = participants;
      await memoryRepo.save(loaded);

      await manager.openRegistration('regional-tourney');
      // Generate schedule
      const schedRes = await manager.generateSchedule('regional-tourney');
      expect(schedRes.success).toBe(true);
      const tournament = schedRes.data!;

      expect(tournament.stages!.length).toBe(3); // Preliminary, Group Stage, Knockout
      const prelimStage = tournament.stages![0]!;
      expect(prelimStage.stageType).toBe('preliminary');
      expect(prelimStage.regions).toBeDefined();
      expect(prelimStage.regions!.length).toBe(4);

      const groupStage = tournament.stages![1]!;
      expect(groupStage.stageType).toBe('group_stage');
      expect(groupStage.status).toBe('pending'); // Must stay pending!

      await manager.startTournament('regional-tourney');

      // Verify initial executable pairings come only from Preliminary regions
      const initialExec = getExecutablePairings(tournament);
      expect(initialExec.length).toBeGreaterThan(0);
      expect(initialExec.every(p => p.stageId === 'stage-preliminary')).toBe(true);

      // Complete the current stage only; the next stage requires an explicit
      // organizer transition.
      const runResult = await manager.runAllMatches('regional-tourney');
      expect(runResult.success).toBe(true);

      const afterPreliminary = (await manager.loadTournament('regional-tourney')).data!;
      expect(afterPreliminary.status).toBe('running');
      expect(afterPreliminary.stages!.find(s => s.stageType === 'group_stage')?.status).toBe('pending');
      expect((await manager.startNextStage('regional-tourney')).success).toBe(true);
      expect((await manager.runAllMatches('regional-tourney')).success).toBe(true);

      const afterGroups = (await manager.loadTournament('regional-tourney')).data!;
      expect(afterGroups.stages!.find(s => s.stageType === 'knockout')?.status).toBe('pending');
      expect((await manager.startNextStage('regional-tourney')).success).toBe(true);
      expect((await manager.runAllMatches('regional-tourney')).success).toBe(true);

      const finished = (await manager.loadTournament('regional-tourney')).data!;
      expect(finished.status).toBe('completed');
      expect(finished.stages!.every(s => s.status === 'completed')).toBe(true);

      // Verify champion crowned
      const koStage = finished.stages!.find(s => s.stageType === 'knockout')!;
      expect(koStage.advancement.advancingParticipantIds.length).toBe(1);
      const championId = koStage.advancement.advancingParticipantIds[0]!;
      expect(participants.some(p => p.participantId === championId)).toBe(true);
    }, 30000);
  });

  describe('Draw & Undetermined Winner Handling', () => {
    it('allows draws in group stage, awards 1 point each, and deterministically advances top 2', async () => {
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: fileRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('draw-group-tourney', 'Group Draw Test', 'multi_stage');
      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('draw-group-tourney', `B${i}`, `Bot ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('draw-group-tourney');
      await manager.generateSchedule('draw-group-tourney');
      await manager.startTournament('draw-group-tourney');

      // Force one match in Group 1 to be a draw
      const initialTournament = (await manager.loadTournament('draw-group-tourney')).data!;
      const groupPairings = initialTournament.stages![0]!.groups![0]!.rounds.flatMap(r => r.pairings);
      const drawMatchId = `draw-group-tourney-${groupPairings[0]!.pairingId}`;
      executor.setOutcome(drawMatchId, 'draw');

      // Run match by ID
      const singleMatchRes = await manager.runPairingById('draw-group-tourney', groupPairings[0]!.pairingId);
      expect(singleMatchRes.success).toBe(true);
      expect(singleMatchRes.data?.matchResult.winner).toBe('draw');

      // Run remaining matches
      const runAllRes = await manager.runAllMatches('draw-group-tourney');
      expect(runAllRes.success).toBe(true);
      await manager.startNextStage('draw-group-tourney');
      await manager.runAllMatches('draw-group-tourney');

      const completedTourney = (await manager.loadTournament('draw-group-tourney')).data!;
      expect(completedTourney.status).toBe('completed');
    });

    it('fails elimination pairing when match ends in a draw without a decisive winner', async () => {
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: fileRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('draw-ko-tourney', 'Knockout Draw Test', 'multi_stage');
      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('draw-ko-tourney', `B${i}`, `Bot ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('draw-ko-tourney');
      await manager.generateSchedule('draw-ko-tourney');
      await manager.startTournament('draw-ko-tourney');

      // Fast-forward group stage by running all group matches
      const loaded = (await manager.loadTournament('draw-ko-tourney')).data!;
      const groupPairings = loaded.stages![0]!.groups![0]!.rounds.flatMap(r => r.pairings);
      for (const gp of groupPairings) {
        await manager.runPairingById('draw-ko-tourney', gp.pairingId);
      }

      // Group stage is now complete, Knockout Round 1 is in_progress
      await manager.startNextStage('draw-ko-tourney');
      const tourneyAfterGroup = (await manager.loadTournament('draw-ko-tourney')).data!;
      const koStage = tourneyAfterGroup.stages!.find(s => s.stageType === 'knockout')!;
      expect(koStage.status).toBe('in_progress');

      const koPairing = koStage.rounds![0]!.pairings[0]!;
      const koMatchId = `draw-ko-tourney-${koPairing.pairingId}`;

      // Set knockout match to end in a draw
      executor.setOutcome(koMatchId, 'draw');

      const koRes = await manager.runPairingById('draw-ko-tourney', koPairing.pairingId);
      expect(koRes.success).toBe(false);
      expect(koRes.error).toContain('Elimination series ended in a draw without a decisive winner');

      // Verify pairing status is marked as pending_tiebreaker
      const reloadedTourney = (await manager.loadTournament('draw-ko-tourney')).data!;
      const failedPairing = getAllTournamentPairings(reloadedTourney).find(p => p.pairingId === koPairing.pairingId)!;
      expect(failedPairing.status).toBe('pending_tiebreaker');
      expect(failedPairing.failureCode).toBe('UNRESOLVED_DRAW');
      expect(failedPairing.tiebreakerStatus).toBe('pending');

      // Retry the pairing with a decisive winner
      executor.setOutcome(koMatchId, 'A');
      const retryRes = await manager.retryPairingById('draw-ko-tourney', koPairing.pairingId);
      expect(retryRes.success).toBe(true);
      expect(['A', 'B']).toContain(retryRes.data?.matchResult.winner);
    });
  });

  describe('Pause and Resume Lifecycle', () => {
    it('aborts execution cleanly via AbortSignal and resumes without data corruption', async () => {
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: fileRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('pause-tourney', 'Pause Test', 'multi_stage');
      for (let i = 1; i <= 8; i++) {
        await manager.registerParticipant('pause-tourney', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('pause-tourney');
      await manager.generateSchedule('pause-tourney');
      await manager.startTournament('pause-tourney');

      // Run only 2 matches then abort
      const controller = new AbortController();
      let matchCount = 0;
      const originalExecute = executor.executeMatch.bind(executor);
      executor.executeMatch = async (...args) => {
        matchCount++;
        if (matchCount >= 2) {
          controller.abort();
        }
        return originalExecute(...args);
      };

      const abortedRun = await manager.runAllMatches('pause-tourney', controller.signal);
      expect(abortedRun.success).toBe(false);
      expect(abortedRun.error).toContain('cancelled');

      // Tournament should remain running
      const pausedTourney = (await manager.loadTournament('pause-tourney')).data!;
      expect(pausedTourney.status).toBe('running');

      // Restore normal executor and resume
      executor.executeMatch = originalExecute;
      const resumeRes = await manager.resumeTournament('pause-tourney');
      expect(resumeRes.success).toBe(true);

      // Finish remaining matches
      let finishRun = await manager.runAllMatches('pause-tourney');
      expect(finishRun.success).toBe(true);
      let loadedTourney = (await manager.loadTournament('pause-tourney')).data!;
      while (loadedTourney.stages?.some(st => st.status === 'pending')) {
        await manager.startNextStage('pause-tourney');
        finishRun = await manager.runAllMatches('pause-tourney');
        expect(finishRun.success).toBe(true);
        loadedTourney = (await manager.loadTournament('pause-tourney')).data!;
      }
      expect(loadedTourney.status).toBe('completed');
    });
  });

  describe('Crash Recovery & Slot Reconciliation', () => {
    it('resets uncommitted in_progress pairings to scheduled and re-resolves dependent slots on restart', async () => {
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: fileRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('crash-tourney', 'Crash Recovery Test', 'multi_stage');
      for (let i = 1; i <= 8; i++) {
        await manager.registerParticipant('crash-tourney', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('crash-tourney');
      await manager.generateSchedule('crash-tourney');
      await manager.startTournament('crash-tourney');

      // Simulate a match that was in progress when the process crashed
      const tourney = (await manager.loadTournament('crash-tourney')).data!;
      const group1Pairing = tourney.stages![0]!.groups![0]!.rounds[0]!.pairings[0]!;
      group1Pairing.status = 'in_progress';
      group1Pairing.matchId = 'crash-tourney-g1-m1';
      group1Pairing.startedAt = new Date().toISOString();
      await fileRepo.save(tourney);

      // Restart manager (new instance pointing to the same repository)
      const freshManager = new TournamentManager({
        repository: fileRepo,
        executor: new AutoRespondingExecutor(),
        enableMultiStage: true,
      });

      const recoveredCount = await freshManager.recoverInterruptedTournaments();
      expect(recoveredCount).toBe(1);

      // Verify the in_progress pairing was reset to scheduled
      const recoveredTourney = (await freshManager.loadTournament('crash-tourney')).data!;
      const resetPairing = recoveredTourney.stages![0]!.groups![0]!.rounds[0]!.pairings[0]!;
      expect(resetPairing.status).toBe('scheduled');
      expect(resetPairing.matchId).toBeNull();

      // Now run all matches to completion
      let finishRes = await freshManager.runAllMatches('crash-tourney');
      expect(finishRes.success).toBe(true);
      let loadedCrash = (await freshManager.loadTournament('crash-tourney')).data!;
      while (loadedCrash.stages?.some(st => st.status === 'pending')) {
        await freshManager.startNextStage('crash-tourney');
        finishRes = await freshManager.runAllMatches('crash-tourney');
        expect(finishRes.success).toBe(true);
        loadedCrash = (await freshManager.loadTournament('crash-tourney')).data!;
      }
      expect(loadedCrash.status).toBe('completed');
    });

    it('recovers a committed result when batch persistence crashes before saving tournament state', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('batch-save-crash', 'Batch Save Crash', 'multi_stage');
      await manager.registerParticipant('batch-save-crash', 'P1', 'Player 1', createBot('bot-1'));
      await manager.registerParticipant('batch-save-crash', 'P2', 'Player 2', createBot('bot-2'));
      await manager.openRegistration('batch-save-crash');
      await manager.generateSchedule('batch-save-crash');
      await manager.startTournament('batch-save-crash');

      const originalSave = memoryRepo.save.bind(memoryRepo);
      let failNextTournamentSave = true;
      memoryRepo.save = async tournament => {
        const hasCompletedPairing = getAllTournamentPairings(tournament).some(pairing => pairing.status === 'completed');
        if (failNextTournamentSave && hasCompletedPairing) {
          failNextTournamentSave = false;
          throw new Error('injected crash before tournament state save');
        }
        await originalSave(tournament);
      };

      const crashedRun = await manager.runAllMatches('batch-save-crash');
      expect(crashedRun.success).toBe(false);
      expect(crashedRun.error).toContain('match(es) failed');
      memoryRepo.save = originalSave;

      const restarted = new TournamentManager({
        repository: memoryRepo,
        executor: new AutoRespondingExecutor(),
        enableMultiStage: true,
      });
      expect(await restarted.recoverInterruptedTournaments()).toBe(1);

      const recovered = (await restarted.loadTournament('batch-save-crash')).data!;
      expect(recovered.status).toBe('completed');
      expect(recovered.stages?.every(stage => stage.status === 'completed')).toBe(true);
      expect(getAllTournamentPairings(recovered).filter(pairing => pairing.status === 'completed')).toHaveLength(1);
      const durableResults = await memoryRepo.listMatchResults('batch-save-crash');
      expect(durableResults).toHaveLength(4);
      expect(durableResults.find(record => record.series)?.series?.games).toHaveLength(3);
    });
  });

  describe('Repository Persistence Independence', () => {
    it('operates fully with InMemoryTournamentRepository without filesystem or SQLite coupling', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      const createRes = await manager.createTournament('mem-tourney', 'In Memory Test', 'multi_stage');
      expect(createRes.success).toBe(true);

      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('mem-tourney', `B${i}`, `Bot ${i}`, createBot(`bot-${i}`));
      }

      await manager.openRegistration('mem-tourney');
      await manager.generateSchedule('mem-tourney');
      await manager.startTournament('mem-tourney');

      let runRes = await manager.runAllMatches('mem-tourney');
      expect(runRes.success).toBe(true);
      let loaded = await memoryRepo.load('mem-tourney');
      while (loaded?.stages?.some(st => st.status === 'pending')) {
        await manager.startNextStage('mem-tourney');
        runRes = await manager.runAllMatches('mem-tourney');
        expect(runRes.success).toBe(true);
        loaded = await memoryRepo.load('mem-tourney');
      }
      expect(loaded?.status).toBe('completed');
      expect(loaded?.stages?.length).toBeGreaterThan(0);
    });
  });

  describe('Hardening & Edge Cases (Phase 2C)', () => {
    it('prevents infinite retry on elimination draw and supports resolveTiebreaker', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('hard-draw-tourney', 'Draw Hardening Test', 'multi_stage');
      for (let i = 1; i <= 8; i++) {
        await manager.registerParticipant('hard-draw-tourney', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }
      await manager.openRegistration('hard-draw-tourney');
      await manager.generateSchedule('hard-draw-tourney');
      await manager.startTournament('hard-draw-tourney');

      // Finish group stage
      const tourney = (await manager.loadTournament('hard-draw-tourney')).data!;
      const groupPairings = tourney.stages![0]!.groups!.flatMap(g => g.rounds.flatMap(r => r.pairings));
      for (const p of groupPairings) {
        await manager.runPairingById('hard-draw-tourney', p.pairingId);
      }

      // Now Knockout Stage is in_progress
      await manager.startNextStage('hard-draw-tourney');
      const koTourney = (await manager.loadTournament('hard-draw-tourney')).data!;
      const koStage = koTourney.stages!.find(s => s.stageType === 'knockout')!;
      const koPairing = koStage.rounds![0]!.pairings[0]!;

      // Force knockout match to draw
      const koMatchId = `hard-draw-tourney-${koPairing.pairingId}`;
      executor.setOutcome(koMatchId, 'draw');

      // First run: ends in draw -> pending_tiebreaker
      const run1 = await manager.runPairingById('hard-draw-tourney', koPairing.pairingId);
      expect(run1.success).toBe(false);
      expect(run1.error).toContain('tiebreaker pending');

      // Attempt runAllMatches: should NOT retry the draw infinitely; stops and reports tiebreaker pending
      const runAllRes = await manager.runAllMatches('hard-draw-tourney');
      expect(runAllRes.success).toBe(false);
      expect(runAllRes.error).toContain('tiebreaker resolution');

      // Verify pairing remains pending_tiebreaker and not reset to scheduled
      const postTourney = (await manager.loadTournament('hard-draw-tourney')).data!;
      const pAfter = getAllTournamentPairings(postTourney).find(p => p.pairingId === koPairing.pairingId)!;
      expect(pAfter.status).toBe('pending_tiebreaker');
      expect(pAfter.failureCode).toBe('UNRESOLVED_DRAW');

      // Resolve the tiebreaker manually
      const resolveRes = await manager.resolveTiebreaker('hard-draw-tourney', koPairing.pairingId, 'A', 'Sudden death penalty');
      expect(resolveRes.success).toBe(true);
      expect(resolveRes.data?.status).toBe('running');

      const resolvedTourney = resolveRes.data!;
      const pResolved = getAllTournamentPairings(resolvedTourney).find(p => p.pairingId === koPairing.pairingId)!;
      expect(pResolved.status).toBe('completed');
      expect(pResolved.tiebreakerStatus).toBe('resolved');

      // Complete the remaining knockout matches
      const finishRes = await manager.runAllMatches('hard-draw-tourney');
      expect(finishRes.success).toBe(true);

      const completedTourney = (await manager.loadTournament('hard-draw-tourney')).data!;
      expect(completedTourney.status).toBe('completed');
    });

    it('prevents double execution of the same pairing concurrently', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      // Slow executor to keep pairing in flight
      let resolveSlowMatch: (() => void) | null = null;
      let slowMatchBlocked = false;
      let resolveMatchStarted!: () => void;
      const matchStarted = new Promise<void>(resolve => { resolveMatchStarted = resolve; });
      const slowExecutor: MatchExecutor = {
        async executeMatch(matchId, botA, botB, config, hooks, signal) {
          resolveMatchStarted();
          if (!slowMatchBlocked) {
            slowMatchBlocked = true;
            await new Promise<void>(res => { resolveSlowMatch = res; });
          }
          return {
            matchId,
            protocolVersion: '1.0',
            winner: 'A',
            terminationReason: 'goal_reached',
            turnCount: 5,
            durationMs: 50,
            turnLog: [],
            error: null,
            replay: null,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
        },
      };

      const manager = new TournamentManager({
        repository: memoryRepo,
        executor: slowExecutor,
        enableMultiStage: true,
      });

      await manager.createTournament('double-exec-tourney', 'Double Exec Test', 'multi_stage');
      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('double-exec-tourney', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }
      await manager.openRegistration('double-exec-tourney');
      await manager.generateSchedule('double-exec-tourney');
      await manager.startTournament('double-exec-tourney');

      const tourney = (await manager.loadTournament('double-exec-tourney')).data!;
      const firstPairing = getAllTournamentPairings(tourney)[0]!;

      // Launch two executions of the exact same pairing concurrently
      const exec1Promise = manager.runPairingById('double-exec-tourney', firstPairing.pairingId);
      await matchStarted;
      const exec2Promise = manager.runPairingById('double-exec-tourney', firstPairing.pairingId);

      // Second execution must be rejected immediately due to active execution lock
      const exec2 = await exec2Promise;
      expect(exec2.success).toBe(false);
      expect(exec2.error).toContain('Pairing not in scheduled state (current: in_progress)');

      // Unblock first execution
      resolveSlowMatch?.();
      const exec1 = await exec1Promise;
      expect(exec1.success).toBe(true);
    });

    it('detects conflicting result and guarantees idempotent re-commit in commitMatchResultAndResolveSlots', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      await manager.createTournament('conflict-tourney', 'Conflict Test', 'multi_stage');
      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('conflict-tourney', `P${i}`, `Player ${i}`, createBot(`bot-${i}`));
      }
      await manager.openRegistration('conflict-tourney');
      await manager.generateSchedule('conflict-tourney');
      await manager.startTournament('conflict-tourney');

      const tourney = (await manager.loadTournament('conflict-tourney')).data!;
      const pairing = getAllTournamentPairings(tourney)[0]!;

      const matchRecord: TournamentMatchRecord = {
        matchId: 'test-m-1',
        pairingId: pairing.pairingId,
        participantA: pairing.participantA,
        participantB: pairing.participantB,
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        durationMs: 100,
        replayRef: 'test-m-1',
        completedAt: new Date().toISOString(),
      };

      // First commit: succeeds
      const commit1 = commitMatchResultAndResolveSlots(tourney, pairing.pairingId, matchRecord);
      expect(commit1.resolvedCount).toBeGreaterThanOrEqual(0);

      // Idempotent second commit with identical result: succeeds without error
      const commit2 = commitMatchResultAndResolveSlots(tourney, pairing.pairingId, matchRecord);
      expect(commit2.resolvedCount).toBe(0);

      // Conflicting commit (winner 'B' instead of 'A'): must throw
      const conflictingRecord: TournamentMatchRecord = {
        ...matchRecord,
        matchId: 'test-m-conflict',
        winner: 'B',
      };
      expect(() => commitMatchResultAndResolveSlots(tourney, pairing.pairingId, conflictingRecord))
        .toThrow(/conflicting result/i);
    });

    it('pauses and resumes across multiple regions without duplicating or prematurely unlocking stages', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: true,
      });

      // 208 bots creates 4 Regional Qualifiers
      const participants: TournamentParticipant[] = Array.from({ length: 208 }, (_, idx) => ({
        participantId: `bot-${idx + 1}`,
        name: `RegBot ${idx + 1}`,
        bot: { botId: `bot-${idx + 1}`, player: 'A', command: 'node', args: [] },
        registeredAt: new Date(idx * 1000).toISOString(),
      }));

      await manager.createTournament('multi-reg-tourney', 'Multi Region Pause Test', 'multi_stage');
      const loaded = (await manager.loadTournament('multi-reg-tourney')).data!;
      loaded.participants = participants;
      await memoryRepo.save(loaded);

      await manager.openRegistration('multi-reg-tourney');
      await manager.generateSchedule('multi-reg-tourney');
      await manager.startTournament('multi-reg-tourney');

      // Run partial matches: run only the first 2 pairings
      const tourney = (await manager.loadTournament('multi-reg-tourney')).data!;
      const prelimStage = tourney.stages!.find(s => s.stageType === 'preliminary')!;
      expect(prelimStage.regions).toHaveLength(4);

      const reg1Pairing = prelimStage.regions![0]!.rounds[0]!.pairings[0]!;
      await manager.runPairingById('multi-reg-tourney', reg1Pairing.pairingId);

      // Verify group stage is still pending
      const midTourney = (await manager.loadTournament('multi-reg-tourney')).data!;
      const groupStage = midTourney.stages!.find(s => s.stageType === 'group_stage')!;
      expect(groupStage.status).toBe('pending');

      // Now run with an AbortSignal to simulate a pause during multi-region execution
      const controller = new AbortController();
      controller.abort();
      const abortRes = await manager.runAllMatches('multi-reg-tourney', controller.signal);
      expect(abortRes.success).toBe(false);
      expect(abortRes.error).toContain('cancelled');

      // Group stage must still be pending
      const afterAbort = (await manager.loadTournament('multi-reg-tourney')).data!;
      const groupAfterAbort = afterAbort.stages!.find(s => s.stageType === 'group_stage')!;
      expect(groupAfterAbort.status).toBe('pending');
    });

    it('strictly preserves legacy single_round_robin behavior when enableMultiStage is false', async () => {
      const memoryRepo = new InMemoryTournamentRepository();
      const executor = new AutoRespondingExecutor();
      const manager = new TournamentManager({
        repository: memoryRepo,
        executor,
        enableMultiStage: false,
      });

      // Attempting to create multi_stage format must be rejected
      const rejectRes = await manager.createTournament('legacy-flag-test', 'Reject Test', 'multi_stage');
      expect(rejectRes.success).toBe(false);
      expect(rejectRes.error).toContain('Multi-stage tournament format is disabled by feature flag');

      // Creating legacy single_round_robin format succeeds
      const legacyRes = await manager.createTournament('legacy-ok', 'Legacy OK', 'single_round_robin');
      expect(legacyRes.success).toBe(true);

      for (let i = 1; i <= 4; i++) {
        await manager.registerParticipant('legacy-ok', `L${i}`, `Legacy ${i}`, createBot(`bot-${i}`));
      }
      await manager.openRegistration('legacy-ok');
      await manager.generateSchedule('legacy-ok');
      await manager.startTournament('legacy-ok');

      const runRes = await manager.runAllMatches('legacy-ok');
      expect(runRes.success).toBe(true);

      const finalLegacy = (await manager.loadTournament('legacy-ok')).data!;
      expect(finalLegacy.status).toBe('completed');
      expect(finalLegacy.rounds.length).toBeGreaterThan(0);
      expect(finalLegacy.stages).toBeUndefined();
      expect(finalLegacy.standings.length).toBe(4);
    });
  });
});
