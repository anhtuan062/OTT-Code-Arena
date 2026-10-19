/**
 * Phase 3G: Tournament Recovery Hardening
 *
 * Verifies and hardens recovery against out-of-order authoritative match records,
 * multi-stage slot dependencies (Regional -> Group -> Knockout QF/SF/Final),
 * stale snapshots with uncommitted in-progress pairings, idempotency,
 * conflicting results, and pending_tiebreaker preservation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  TournamentManager,
  TournamentFormat,
  TournamentParticipant,
  TournamentMatchRecord,
  FileTournamentRepository,
} from '../../tournament/index.js';
import type { MatchExecutor } from '../../tournament/executor.js';
import type { MatchResult, MatchReplay, BotDefinition, MatchConfig } from '@match-runner/types.js';
import {
  isMultiStageTournament,
  getAllTournamentPairings,
  isTournamentComplete,
  isSlotPlaceholder,
} from '../../tournament/multi-stage.js';

class HardeningMockExecutor implements MatchExecutor {
  public executedPairings: string[] = [];
  public matchWinners = new Map<string, 'A' | 'B' | 'draw'>();

  async executeMatch(
    matchId: string,
    botA: BotDefinition,
    botB: BotDefinition,
    config: MatchConfig,
    callbacks?: any,
    signal?: AbortSignal
  ): Promise<MatchResult> {
    this.executedPairings.push(matchId);
    const winner = this.matchWinners.get(matchId) ?? 'A';
    return {
      matchId,
      protocolVersion: '0.1.0',
      status: 'finished',
      winner,
      terminationReason: winner === 'draw' ? 'turn_limit' : 'goal_reached',
      turnCount: 8,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 50,
      playerA: botA,
      playerB: botB,
      finalState: {
        turn: 8,
        currentPlayer: 'A',
        status: 'finished',
        winner: winner === 'draw' ? null : winner,
        winReason: winner === 'draw' ? 'turn_limit' : 'goal_reached',
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
}

describe('Phase 3G: Tournament Recovery Hardening', () => {
  let tempDir: string;
  let repository: FileTournamentRepository;
  let manager: TournamentManager;
  let executor: HardeningMockExecutor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-hardening-'));
    repository = new FileTournamentRepository({ baseDir: tempDir });
    await repository.initialize();
    executor = new HardeningMockExecutor();
    manager = new TournamentManager({
      repository,
      executor,
      enableMultiStage: true,
    });
  });

  afterEach(async () => {
    repository.close();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('reconciles inverted Knockout match records (Final -> SF -> QF) without slot dependency failure', async () => {
    const tournamentId = 'test-reversed-knockout';
    const participants: TournamentParticipant[] = Array.from({ length: 16 }, (_, i) => ({
      participantId: `bot-${String(i + 1).padStart(2, '0')}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: {
        botId: `bot-${String(i + 1).padStart(2, '0')}`,
        name: `Bot ${i + 1}`,
        command: 'node',
        args: ['bot.js'],
      },
    }));

    await manager.createTournament(tournamentId, 'Reversed Knockout Arena', 'multi_stage');
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

    // Capture snapshot at start of Knockout (QF scheduled, SF & Final with placeholders)
    const snapshotAtKnockoutStart = await repository.load(tournamentId);
    expect(snapshotAtKnockoutStart).not.toBeNull();

    // 2. Run Knockout matches (4 QF, 2 SF, 1 Final)
    const tourneyAtKO = (await repository.load(tournamentId))!;
    for (const p of tourneyAtKO.stages![1]!.rounds![0]!.pairings) {
      await manager.runPairingById(tournamentId, p.pairingId);
    }
    const tourneyAtSF = (await repository.load(tournamentId))!;
    for (const p of tourneyAtSF.stages![1]!.rounds![1]!.pairings) {
      await manager.runPairingById(tournamentId, p.pairingId);
    }
    const tourneyAtFinal = (await repository.load(tournamentId))!;
    const finalPairing = tourneyAtFinal.stages![1]!.rounds![2]!.pairings[0]!;
    await manager.runPairingById(tournamentId, finalPairing.pairingId);

    // Collect all match records on disk
    const matchRecordsOnDisk = await repository.listMatchResults(tournamentId);
    expect(matchRecordsOnDisk.length).toBe(31);

    // 3. Rollback tournament.json to snapshotAtKnockoutStart
    await repository.save(snapshotAtKnockoutStart!);

    // 4. Invert records: Final -> SF -> QF -> Group
    const reversedRecords = [...matchRecordsOnDisk].reverse();
    // Intentionally scramble timestamps so completedAt cannot be relied upon
    for (const record of reversedRecords) {
      record.completedAt = new Date(1700000000000).toISOString();
    }

    // 5. Recover using multi-pass reconciliation
    const recoveryManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });

    const rolledBack = (await repository.load(tournamentId))!;
    await (recoveryManager as any).reconcileInterruptedPairings(rolledBack, reversedRecords);
    await repository.save(rolledBack);

    // 6. Verify all Knockout pairings and winner slots are fully resolved
    const recovered = (await repository.load(tournamentId))!;
    const koStage = recovered.stages![1]!;

    for (const round of koStage.rounds!) {
      for (const p of round.pairings) {
        expect(p.status).toBe('completed');
        expect(p.matchResult).toBeDefined();
        expect(isSlotPlaceholder(p.participantA)).toBe(false);
        expect(isSlotPlaceholder(p.participantB)).toBe(false);
      }
    }

    expect(isTournamentComplete(recovered)).toBe(true);
  }, 30_000);

  it('reconciles 4-region multi-stage tournament when records are completely shuffled', async () => {
    const tournamentId = 'test-shuffled-4region';
    // 64 bots: 4 regions x 16 bots -> Group Stage -> Knockout
    const participants: TournamentParticipant[] = Array.from({ length: 64 }, (_, i) => ({
      participantId: `regbot-${String(i + 1).padStart(3, '0')}`,
      name: `RegBot ${i + 1}`,
      seed: i + 1,
      bot: {
        botId: `regbot-${String(i + 1).padStart(3, '0')}`,
        name: `RegBot ${i + 1}`,
        command: 'node',
        args: ['bot.js'],
      },
    }));

    await manager.createTournament(tournamentId, '4-Region Shuffled Recovery', 'multi_stage');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Run all matches to completion
    await manager.runAllMatches(tournamentId);

    const completedTourney = (await repository.load(tournamentId))!;
    expect(isTournamentComplete(completedTourney)).toBe(true);

    const allRecords = await repository.listMatchResults(tournamentId);
    expect(allRecords.length).toBeGreaterThan(50);

    // Reset tournament.json to a brand new schedule with 0 matches played
    // Every region is at round 1, group stage has placeholders, knockout has placeholders
    const freshScheduleManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });
    await freshScheduleManager.createTournament('temp-fresh', 'Temp', 'multi_stage');
    const fresh = (await repository.load('temp-fresh'))!;
    fresh.tournamentId = tournamentId;
    fresh.participants = participants;
    fresh.status = 'registration_closed';
    await repository.save(fresh);
    await freshScheduleManager.generateSchedule(tournamentId);
    await freshScheduleManager.startTournament(tournamentId);

    // Scramble match records completely: reverse + set identical timestamps
    const scrambledRecords = [...allRecords].reverse();
    for (const r of scrambledRecords) {
      r.completedAt = new Date(1700000000000).toISOString();
    }

    // Reconcile on fresh schedule with scrambled records
    const recoveryManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });
    const staleTourney = (await repository.load(tournamentId))!;
    await (recoveryManager as any).reconcileInterruptedPairings(staleTourney, scrambledRecords);
    await repository.save(staleTourney);

    // Verify full tournament is recovered with all slots, standings and stages completed
    const fullyRecovered = (await repository.load(tournamentId))!;
    expect(isTournamentComplete(fullyRecovered)).toBe(true);

    const allPairings = getAllTournamentPairings(fullyRecovered);
    for (const p of allPairings) {
      expect(p.status).toBe('completed');
      expect(isSlotPlaceholder(p.participantA)).toBe(false);
      if (p.participantB) {
        expect(isSlotPlaceholder(p.participantB)).toBe(false);
      }
    }
  }, 30_000);

  it('resets uncommitted in_progress pairings to scheduled while preserving committed results', async () => {
    const tournamentId = 'test-in-progress-reset';
    const participants: TournamentParticipant[] = Array.from({ length: 8 }, (_, i) => ({
      participantId: `bot-${i + 1}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${i + 1}`, name: `Bot ${i + 1}`, command: 'node', args: [] },
    }));

    await manager.createTournament(tournamentId, 'In-Progress Reset Arena', 'single_round_robin');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Run first 3 matches
    for (let i = 0; i < 3; i++) {
      await manager.runNextMatch(tournamentId);
    }

    // Now artificially mark pairing 4 as in_progress (simulating crash before saveMatchResult)
    const tourneyWithInProgress = (await repository.load(tournamentId))!;
    const pairing4 = tourneyWithInProgress.rounds[0]!.pairings[3]!;
    pairing4.status = 'in_progress';
    pairing4.matchId = 'interrupted-match-4';
    pairing4.startedAt = new Date().toISOString();
    await repository.save(tourneyWithInProgress);

    // Server restarts:
    const restartManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
    });

    const recoveredCount = await restartManager.recoverInterruptedTournaments();
    expect(recoveredCount).toBe(1);

    const afterRecovery = (await repository.load(tournamentId))!;
    const recoveredPairing4 = afterRecovery.rounds[0]!.pairings[3]!;
    // Must be cleanly reset to scheduled with null matchId
    expect(recoveredPairing4.status).toBe('scheduled');
    expect(recoveredPairing4.matchId).toBeNull();
    expect(recoveredPairing4.startedAt).toBeNull();

    // First 3 pairings must remain completed
    for (let i = 0; i < 3; i++) {
      expect(afterRecovery.rounds[0]!.pairings[i]!.status).toBe('completed');
    }
  });

  it('verifies idempotency: multiple reconciliation passes produce 0 changes', async () => {
    const tournamentId = 'test-idempotent-recovery';
    const participants: TournamentParticipant[] = Array.from({ length: 8 }, (_, i) => ({
      participantId: `bot-${i + 1}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${i + 1}`, name: `Bot ${i + 1}`, command: 'node', args: [] },
    }));

    await manager.createTournament(tournamentId, 'Idempotency Arena', 'single_round_robin');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Run all matches
    await manager.runAllMatches(tournamentId);
    const tourneyBefore = JSON.stringify(await repository.load(tournamentId));

    // Run recovery again
    const restartManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
    });
    await restartManager.recoverInterruptedTournaments();

    const tourneyAfter = JSON.stringify(await repository.load(tournamentId));
    // Tournament state is strictly identical
    expect(tourneyAfter).toBe(tourneyBefore);
  });

  it('detects conflicting match results on completed pairings and rejects them', async () => {
    const tournamentId = 'test-conflicting-results';
    const participants: TournamentParticipant[] = Array.from({ length: 4 }, (_, i) => ({
      participantId: `bot-${i + 1}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${i + 1}`, name: `Bot ${i + 1}`, command: 'node', args: [] },
    }));

    await manager.createTournament(tournamentId, 'Conflict Arena', 'single_round_robin');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Run pairing 1 (bot-1 vs bot-2, bot-1 wins as player A)
    const runResult = await manager.runNextMatch(tournamentId);
    expect(runResult.success).toBe(true);

    const tourney = (await repository.load(tournamentId))!;
    const pairing1 = tourney.rounds[0]!.pairings[0]!;
    expect(pairing1.status).toBe('completed');
    expect(pairing1.matchResult?.winner).toBe('A');

    // Create a conflicting record for the same pairingId where winner is 'B'
    const conflictingRecord: TournamentMatchRecord = {
      ...pairing1.matchResult!,
      winner: 'B',
    };

    // Reconcile with conflicting record must throw an explicit error
    await expect(
      (manager as any).reconcileInterruptedPairings(tourney, [conflictingRecord])
    ).rejects.toThrow(/already completed with conflicting result/i);
  });

  it('preserves pending_tiebreaker across restart and advances after resolution', async () => {
    const tournamentId = 'test-tiebreaker-recovery';
    const participants: TournamentParticipant[] = Array.from({ length: 8 }, (_, i) => ({
      participantId: `bot-${i + 1}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${i + 1}`, name: `Bot ${i + 1}`, command: 'node', args: [] },
    }));

    await manager.createTournament(tournamentId, 'Tiebreaker Recovery Arena', 'multi_stage');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Fast forward group stage so Knockout stage unlocks
    while (true) {
      const t = (await repository.load(tournamentId))!;
      const groupStage = t.stages!.find(s => s.stageType === 'group_stage')!;
      if (groupStage.status === 'completed') break;
      await manager.runNextMatch(tournamentId);
    }

    // Find the first Knockout pairing
    const tourney = (await repository.load(tournamentId))!;
    const knockoutStage = tourney.stages!.find(s => s.stageType === 'knockout')!;
    expect(knockoutStage.status).toBe('in_progress');
    const koPairing = knockoutStage.rounds![0]!.pairings[0]!;

    // Configure executor to produce a draw for this elimination pairing
    const matchId = `${tournamentId}-${koPairing.pairingId}`;
    executor.matchWinners.set(matchId, 'draw');

    // Run the pairing - should become pending_tiebreaker
    const result = await manager.runPairingById(tournamentId, koPairing.pairingId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tiebreaker pending');

    const tourneyWithPending = (await repository.load(tournamentId))!;
    const koStageAfterDraw = tourneyWithPending.stages!.find(s => s.stageType === 'knockout')!;
    const pAfterDraw = koStageAfterDraw.rounds![0]!.pairings.find(p => p.pairingId === koPairing.pairingId)!;
    expect(pAfterDraw.status).toBe('pending_tiebreaker');
    expect(pAfterDraw.tiebreakerStatus).toBe('pending');

    // Simulate server restart: recovery must preserve pending_tiebreaker
    const restartManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });
    await restartManager.recoverInterruptedTournaments();

    const afterRestart = (await repository.load(tournamentId))!;
    const koStageAfterRestart = afterRestart.stages!.find(s => s.stageType === 'knockout')!;
    const pAfterRestart = koStageAfterRestart.rounds![0]!.pairings.find(p => p.pairingId === koPairing.pairingId)!;
    expect(pAfterRestart.status).toBe('pending_tiebreaker');
    expect(pAfterRestart.tiebreakerStatus).toBe('pending');
    expect(pAfterRestart.matchResult).toBeDefined();

    // Now resolve the tiebreaker
    const resolution = await restartManager.resolveTiebreaker(
      tournamentId,
      koPairing.pairingId,
      'A',
      'Tiebreaker coin toss',
      'head_judge'
    );
    expect(resolution.success).toBe(true);

    const tourneyResolved = (await repository.load(tournamentId))!;
    const koStageResolved = tourneyResolved.stages!.find(s => s.stageType === 'knockout')!;
    const pResolved = koStageResolved.rounds![0]!.pairings.find(p => p.pairingId === koPairing.pairingId)!;
    expect(pResolved.status).toBe('completed');
    expect(pResolved.tiebreakerStatus).toBe('resolved');
    expect(pResolved.matchResult?.winner).toBe('A');
    expect(tourneyResolved.metadata?.tiebreakerAudit).toHaveLength(1);

    // Another restart: recovery must recognize the resolved tiebreaker and remain completed
    const finalRestartManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });
    await finalRestartManager.recoverInterruptedTournaments();

    const finalTourney = (await repository.load(tournamentId))!;
    const koStageFinal = finalTourney.stages!.find(s => s.stageType === 'knockout')!;
    const pFinal = koStageFinal.rounds![0]!.pairings.find(p => p.pairingId === koPairing.pairingId)!;
    expect(pFinal.status).toBe('completed');
    expect(pFinal.tiebreakerStatus).toBe('resolved');
  });

  it('verifies commit marker and SHA-256 integrity on match results during recovery', async () => {
    const tournamentId = 'test-commit-integrity';
    const participants: TournamentParticipant[] = Array.from({ length: 4 }, (_, i) => ({
      participantId: `bot-${i + 1}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${i + 1}`, name: `Bot ${i + 1}`, command: 'node', args: [] },
    }));

    await manager.createTournament(tournamentId, 'Commit Integrity Arena', 'single_round_robin');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // Run first match
    await manager.runNextMatch(tournamentId);

    const tourneyDir = path.join(tempDir, tournamentId);
    const files = await fs.readdir(tourneyDir);

    // Verify match, replay, and commit marker exist
    const matchFiles = files.filter(f => f.startsWith('match-') && !f.endsWith('.commit.json'));
    const replayFiles = files.filter(f => f.startsWith('replay-'));
    const commitFiles = files.filter(f => f.endsWith('.commit.json'));

    expect(matchFiles.length).toBe(1);
    expect(replayFiles.length).toBe(1);
    expect(commitFiles.length).toBe(1);

    // Verify commit marker content contains valid SHA-256 hashes
    const commitContent = JSON.parse(await fs.readFile(path.join(tourneyDir, commitFiles[0]!), 'utf8'));
    expect(commitContent.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(commitContent.replayHash).toMatch(/^[a-f0-9]{64}$/);

    // Verify listMatchResults verifies commit marker
    const results = await repository.listMatchResults(tournamentId);
    expect(results).toHaveLength(1);
  });

  it('F-02: defers knockout reconciliation when opposing slot is still a placeholder, reconciling only when both participants are concrete', async () => {
    const tournamentId = 'test-f02-knockout-placeholder';
    const participants: TournamentParticipant[] = Array.from({ length: 16 }, (_, i) => ({
      participantId: `bot-${String(i + 1).padStart(2, '0')}`,
      name: `Bot ${i + 1}`,
      seed: i + 1,
      bot: { botId: `bot-${String(i + 1).padStart(2, '0')}`, name: `Bot ${i + 1}`, command: 'node', args: ['bot.js'] },
    }));

    await manager.createTournament(tournamentId, 'F02 Knockout Reconcile Arena', 'multi_stage');
    const loaded = (await repository.load(tournamentId))!;
    loaded.participants = participants;
    loaded.status = 'registration_closed';
    await repository.save(loaded);

    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);

    // 1. Run all Group Stage matches so Knockout is scheduled
    while (true) {
      const t = (await repository.load(tournamentId))!;
      const groupStage = t.stages!.find(s => s.stageType === 'group_stage')!;
      if (groupStage.status === 'completed') break;
      await manager.runNextMatch(tournamentId);
    }

    // 2. Run QF1, QF2, and SF1
    const tourneyAtKO = (await repository.load(tournamentId))!;
    const koStage = tourneyAtKO.stages!.find(s => s.stageType === 'knockout')!;
    const qf1 = koStage.rounds![0]!.pairings[0]!;
    const qf2 = koStage.rounds![0]!.pairings[1]!;
    const sf1 = koStage.rounds![1]!.pairings[0]!;

    await manager.runPairingById(tournamentId, qf1.pairingId);
    await manager.runPairingById(tournamentId, qf2.pairingId);
    await manager.runPairingById(tournamentId, sf1.pairingId);

    // Retrieve match records for QF1, QF2, SF1
    const records = await repository.listMatchResults(tournamentId);
    const qf2Record = records.find(r => r.pairingId === qf2.pairingId)!;
    const sf1Record = records.find(r => r.pairingId === sf1.pairingId)!;
    expect(qf2Record).toBeDefined();
    expect(sf1Record).toBeDefined();

    // 3. Construct a stale state where QF1 has already run and resolved SF1's slot A,
    // but QF2 has NOT been resolved yet (so SF1 slot B is still a placeholder!)
    const staleTourney = (await repository.load(tournamentId))!;
    const staleKO = staleTourney.stages!.find(s => s.stageType === 'knockout')!;
    const staleSF1 = staleKO.rounds![1]!.pairings.find(p => p.pairingId === sf1.pairingId)!;
    const staleQF2 = staleKO.rounds![0]!.pairings.find(p => p.pairingId === qf2.pairingId)!;

    // Reset QF2 to scheduled
    staleQF2.status = 'scheduled';
    delete (staleQF2 as any).matchResult;
    staleQF2.completedAt = null;

    // Reset SF1 to scheduled, with slot A concrete but slot B as placeholder
    staleSF1.status = 'scheduled';
    delete (staleSF1 as any).matchResult;
    staleSF1.completedAt = null;
    staleSF1.participantB = 'KO-QF2-winner';
    if (staleSF1.slotB) {
      staleSF1.slotB.participantId = null;
    }

    expect(isSlotPlaceholder(staleSF1.participantB)).toBe(true);

    // 4. Feed records in intentionally out-of-order sequence: [SF1, QF2]
    // SF1 arrives FIRST with winner A, while its slot B is still a placeholder!
    const outOfOrderRecords = [sf1Record, qf2Record];

    const recoveryManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });

    await (recoveryManager as any).reconcileInterruptedPairings(staleTourney, outOfOrderRecords);

    // 5. Verify that SF1 was not reconciled with an unresolved placeholder slot B.
    // Both QF2 and SF1 must be fully completed and both participants in SF1 must be concrete.
    const resolvedSF1 = staleKO.rounds![1]!.pairings.find(p => p.pairingId === sf1.pairingId)!;
    expect(resolvedSF1.status).toBe('completed');
    expect(isSlotPlaceholder(resolvedSF1.participantA)).toBe(false);
    expect(isSlotPlaceholder(resolvedSF1.participantB)).toBe(false);
    expect(resolvedSF1.participantB).toBe(staleQF2.matchResult?.winner === 'A' ? staleQF2.participantA : staleQF2.participantB);
  });

  it('F-04: identifies elimination stages using stageType from metadata even with custom stageId', async () => {
    const tournamentId = 'test-f04-stage-type-detection';
    await manager.createTournament(tournamentId, 'Custom StageId Arena', 'multi_stage');
    const tourney = (await repository.load(tournamentId))!;

    const participantA: TournamentParticipant = {
      participantId: 'bot-alpha',
      name: 'Bot Alpha',
      seed: 1,
      bot: { botId: 'bot-alpha', name: 'Bot Alpha', command: 'node', args: [] },
    };
    const participantB: TournamentParticipant = {
      participantId: 'bot-beta',
      name: 'Bot Beta',
      seed: 2,
      bot: { botId: 'bot-beta', name: 'Bot Beta', command: 'node', args: [] },
    };
    tourney.participants = [participantA, participantB];
    tourney.status = 'in_progress';

    // Custom stageId that does NOT match literal 'stage-preliminary' or 'stage-knockout'
    tourney.stages = [
      {
        stageId: 'stage-regional-championship-finals',
        stageType: 'knockout',
        name: 'Regional Championship Finals',
        order: 1,
        status: 'in_progress',
        rounds: [
          {
            roundNumber: 1,
            pairings: [
              {
                pairingId: 'pairing-final-01',
                stageId: 'stage-regional-championship-finals',
                round: 1,
                participantA: 'bot-alpha',
                participantB: 'bot-beta',
                status: 'scheduled',
              },
            ],
          },
        ],
      },
    ];

    await repository.save(tourney);

    // Simulate match record ending in a draw
    const drawRecord: TournamentMatchRecord = {
      matchId: 'm-draw-1',
      pairingId: 'pairing-final-01',
      round: 1,
      playerA: participantA.bot,
      playerB: participantB.bot,
      scoreA: 0,
      scoreB: 0,
      winner: null,
      terminationReason: 'draw_agreement',
      turnCount: 20,
      durationMs: 100,
      replayRef: 'replay-draw-1',
      completedAt: new Date().toISOString(),
    };

    const recoveryManager = new TournamentManager({
      repository,
      executor: new HardeningMockExecutor(),
      enableMultiStage: true,
    });

    const loaded = (await repository.load(tournamentId))!;
    await (recoveryManager as any).reconcileInterruptedPairings(loaded, [drawRecord]);

    const pairingAfterRecovery = loaded.stages![0]!.rounds![0]!.pairings[0]!;
    expect(pairingAfterRecovery.status).toBe('pending_tiebreaker');
    expect(pairingAfterRecovery.failureCode).toBe('UNRESOLVED_DRAW');
    expect(pairingAfterRecovery.tiebreakerStatus).toBe('pending');
  });
});

