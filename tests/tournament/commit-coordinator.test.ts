/**
 * Isolated Serialized Tournament Commit Coordinator - Hardened Test Suite
 *
 * Exercises TournamentCommitCoordinator against both in-memory and real
 * FileTournamentRepository persistence implementations:
 *
 * 1. Result/Replay/Commit-Marker Triad validation on disk
 * 2. Pre-write validation (durable claim identity, slot placeholders, conflicts)
 * 3. Zero-I/O identical retries (no file modifications)
 * 4. Conflict rejection without overwriting existing on-disk artifacts
 * 5. BO3 game order enforcement, series identity, and durable replay checkpoints
 * 6. Crash-window reconciliation (committed match artifacts without tournament save)
 * 7. Concurrent commits and lost update prevention
 * 8. Per-tournament lock isolation
 * 9. Failure recovery and guaranteed lock release
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  Tournament,
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentSeriesGameRecord,
} from '@tournament/types.js';
import { FileTournamentRepository, TournamentRepository } from '@tournament/persistence.js';
import type { MatchReplay } from '@match-runner/types.js';
import {
  TournamentCommitCoordinator,
  createTournamentCommitCoordinator,
  createCompliantReplay,
  ConflictingCommitError,
  DurableClaimMismatchError,
  InvalidGameOrderError,
  TournamentNotFoundError,
  PairingNotFoundError,
  StageTransitionEvent,
} from '@tournament/commit-coordinator.js';
import { createMultiStageTournament } from '@tournament/multi-stage.js';
import { generateRoundRobinSchedule } from '@tournament/scheduling.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createParticipants(count: number): TournamentParticipant[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `bot-${i + 1}`;
    return {
      participantId: id,
      name: `Bot ${i + 1}`,
      bot: {
        botId: id,
        player: 'A',
        command: 'node',
        args: ['bot.js'],
      },
      registeredAt: new Date(1000 * (i + 1)).toISOString(),
    };
  });
}

function createRoundRobinTournament(tournamentId: string, participantCount = 4): Tournament {
  const participants = createParticipants(participantCount);
  const rounds = generateRoundRobinSchedule(participants);

  return {
    tournamentId,
    name: `Test RR Tournament ${tournamentId}`,
    format: 'single_round_robin',
    status: 'running',
    participants,
    matchConfig: {
      protocolVersion: '0.1.0',
      maxTurns: 100,
      turnTimeoutMs: 1000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
      failurePolicy: 'forfeit',
      maxRetries: 0,
      logRequests: false,
      logResponses: false,
      logStates: false,
      bestOf: 1,
    },
    scoringConfig: {
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      byePoints: 0,
    },
    rounds,
    standings: participants.map(p => ({
      participantId: p.participantId,
      participantName: p.name,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      forfeits: 0,
      points: 0,
      tiebreakHeadToHead: {},
    })),
    createdAt: new Date().toISOString(),
    registrationOpenedAt: new Date().toISOString(),
    registrationClosedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function createMockMatchRecord(
  pairingId: string,
  participantA: string,
  participantB: string | null,
  winner: 'A' | 'B' | 'draw' = 'A',
  customMatchId?: string
): TournamentMatchRecord {
  const matchId = customMatchId ?? `m-${pairingId}`;
  return {
    matchId,
    pairingId,
    participantA,
    participantB,
    winner,
    terminationReason: 'goal_reached',
    turnCount: 15,
    durationMs: 120,
    replayRef: matchId,
    completedAt: new Date().toISOString(),
  };
}

function createMockReplay(matchResult: TournamentMatchRecord): MatchReplay {
  return {
    matchId: matchResult.matchId,
    protocolVersion: '0.1.0',
    initialState: {
      boardSize: 9,
      turn: 1,
      currentPlayer: 'A',
      status: 'playing',
      winner: null,
      winReason: null,
      pieces: [],
      lastMove: null,
    },
    moves: [],
    finalState: {
      boardSize: 9,
      turn: matchResult.turnCount,
      currentPlayer: 'A',
      status: 'finished',
      winner: matchResult.winner === 'draw' ? null : matchResult.winner,
      winReason: matchResult.terminationReason,
      pieces: [],
      lastMove: null,
    },
    winner: matchResult.winner,
    terminationReason: matchResult.terminationReason,
  };
}

// ============================================================================
// Real FileTournamentRepository Persistence Regression Suite
// ============================================================================

describe('TournamentCommitCoordinator - Real FileTournamentRepository Contract', () => {
  let baseDir: string;
  let repository: FileTournamentRepository;
  let coordinator: TournamentCommitCoordinator;

  beforeEach(async () => {
    baseDir = path.join(os.tmpdir(), `ott-coord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(baseDir, { recursive: true });
    repository = new FileTournamentRepository({ baseDir });
    await repository.initialize();
    coordinator = createTournamentCommitCoordinator(repository);
  });

  afterEach(async () => {
    repository.close();
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Commit Marker Triad & Persistence Contract', () => {
    it('creates a fully verified result/replay/commit-marker triad on disk', async () => {
      const tournament = createRoundRobinTournament('t-triad', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A');
      const replay = createMockReplay(matchRecord);

      const res = await coordinator.commitMatchResult({
        tournamentId: 't-triad',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
        replay,
      });

      expect(res.success).toBe(true);
      expect(res.committed).toBe(true);

      // Verify the 3-file triad on disk
      const tournDir = path.join(baseDir, 't-triad');
      const resultFile = path.join(tournDir, `match-${matchRecord.matchId}.json`);
      const replayFile = path.join(tournDir, `replay-${matchRecord.matchId}.json`);
      const commitFile = path.join(tournDir, `match-${matchRecord.matchId}.commit.json`);

      expect(await fs.access(resultFile).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(replayFile).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(commitFile).then(() => true).catch(() => false)).toBe(true);

      // Verify FileTournamentRepository validates the triad cleanly
      const loadedResult = await repository.loadMatchResult('t-triad', matchRecord.matchId);
      const loadedReplay = await repository.loadReplay('t-triad', matchRecord.matchId);

      expect(loadedResult).not.toBeNull();
      expect(loadedResult?.matchId).toBe(matchRecord.matchId);
      expect(loadedResult?.winner).toBe('A');

      expect(loadedReplay).not.toBeNull();
      expect(loadedReplay?.matchId).toBe(matchRecord.matchId);
    });

    it('synthesizes a compliant replay when omitted, satisfying FileTournamentRepository triad checks', async () => {
      const tournament = createRoundRobinTournament('t-triad-synth', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'B');

      // Replay is deliberately omitted
      const res = await coordinator.commitMatchResult({
        tournamentId: 't-triad-synth',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
      });

      expect(res.success).toBe(true);
      expect(res.committed).toBe(true);

      // FileTournamentRepository loadCommittedMatch must NOT throw Inconsistent persisted match
      const loadedResult = await repository.loadMatchResult('t-triad-synth', matchRecord.matchId);
      const loadedReplay = await repository.loadReplay('t-triad-synth', matchRecord.matchId);

      expect(loadedResult?.winner).toBe('B');
      expect(loadedReplay?.matchId).toBe(matchRecord.matchId);
    });

    it('preserves Conversion rule modifiers through compliant replay persistence', async () => {
      const tournament = createRoundRobinTournament('t-triad-conversion', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A');
      const replay = { ...createMockReplay(matchRecord), ruleModifiers: { conversion: true } };

      const compliantReplay = createCompliantReplay(matchRecord, replay);
      expect(compliantReplay.ruleModifiers).toEqual({ conversion: true });

      const res = await coordinator.commitMatchResult({
        tournamentId: 't-triad-conversion',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
        replay,
      });

      expect(res.success).toBe(true);
      const loadedReplay = await repository.loadReplay('t-triad-conversion', matchRecord.matchId);
      expect(loadedReplay?.ruleModifiers).toEqual({ conversion: true });
    });
  });

  describe('Zero-I/O Identical Retries & Conflict Isolation', () => {
    it('executes identical retries with zero disk writes', async () => {
      const tournament = createRoundRobinTournament('t-zero-io', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A');

      // 1. Initial commit
      await coordinator.commitMatchResult({
        tournamentId: 't-zero-io',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
      });

      const tournDir = path.join(baseDir, 't-zero-io');
      const resultFile = path.join(tournDir, `match-${matchRecord.matchId}.json`);
      const tournFile = path.join(tournDir, 'tournament.json');

      const statResult1 = await fs.stat(resultFile);
      const statTourn1 = await fs.stat(tournFile);

      // Small pause to ensure mtime would advance if written
      await new Promise(r => setTimeout(r, 20));

      // 2. Identical retry
      const retryRes = await coordinator.commitMatchResult({
        tournamentId: 't-zero-io',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
      });

      expect(retryRes.committed).toBe(false);
      expect(retryRes.idempotent).toBe(true);

      // Verify files were not rewritten
      const statResult2 = await fs.stat(resultFile);
      const statTourn2 = await fs.stat(tournFile);

      expect(statResult2.mtimeMs).toBe(statResult1.mtimeMs);
      expect(statTourn2.mtimeMs).toBe(statTourn1.mtimeMs);
    });

    it('rejects conflicting result BEFORE writing artifacts and preserves existing disk files', async () => {
      const tournament = createRoundRobinTournament('t-conflict-persist', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const originalRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A');

      // 1. Initial commit (winner A)
      await coordinator.commitMatchResult({
        tournamentId: 't-conflict-persist',
        pairingId: pairing.pairingId,
        matchResult: originalRecord,
      });

      const tournDir = path.join(baseDir, 't-conflict-persist');
      const resultFile = path.join(tournDir, `match-${originalRecord.matchId}.json`);
      const originalData = await fs.readFile(resultFile, 'utf-8');
      expect(JSON.parse(originalData).winner).toBe('A');

      // 2. Conflicting commit (winner B)
      const conflictingRecord = createMockMatchRecord(
        pairing.pairingId,
        pairing.participantA,
        pairing.participantB,
        'B',
        originalRecord.matchId // Same matchId, conflicting winner
      );

      await expect(
        coordinator.commitMatchResult({
          tournamentId: 't-conflict-persist',
          pairingId: pairing.pairingId,
          matchResult: conflictingRecord,
        })
      ).rejects.toThrow(ConflictingCommitError);

      // Verify disk artifact was NOT overwritten with winner B!
      const currentData = await fs.readFile(resultFile, 'utf-8');
      expect(JSON.parse(currentData).winner).toBe('A');
      expect(JSON.parse(currentData).winner).not.toBe('B');

      // Verify lock is released
      expect(coordinator.isLocked('t-conflict-persist')).toBe(false);
    });
  });

  describe('Durable Claim Identity', () => {
    it('claims pairing and enforces matchId identity on subsequent commit', async () => {
      const tournament = createRoundRobinTournament('t-claims', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const claimId = `claimed-${pairing.pairingId}`;

      // Claim the pairing
      const claimRes = await coordinator.claimPairing({
        tournamentId: 't-claims',
        pairingId: pairing.pairingId,
        matchId: claimId,
      });

      expect(claimRes.claimed).toBe(true);
      expect(claimRes.pairing.status).toBe('in_progress');
      expect(claimRes.pairing.matchId).toBe(claimId);

      // Attempting to commit with a mismatched matchId must fail with DurableClaimMismatchError
      const wrongMatchRecord = createMockMatchRecord(
        pairing.pairingId,
        pairing.participantA,
        pairing.participantB,
        'A',
        'm-wrong-id'
      );

      await expect(
        coordinator.commitMatchResult({
          tournamentId: 't-claims',
          pairingId: pairing.pairingId,
          matchResult: wrongMatchRecord,
        })
      ).rejects.toThrow(DurableClaimMismatchError);

      // Committing with the claimed matchId succeeds
      const correctMatchRecord = createMockMatchRecord(
        pairing.pairingId,
        pairing.participantA,
        pairing.participantB,
        'A',
        claimId
      );

      const commitRes = await coordinator.commitMatchResult({
        tournamentId: 't-claims',
        pairingId: pairing.pairingId,
        matchResult: correctMatchRecord,
      });

      expect(commitRes.success).toBe(true);
      expect(commitRes.committed).toBe(true);
    });

    it('releases a claim and reverts pairing back to scheduled', async () => {
      const tournament = createRoundRobinTournament('t-claim-release', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      await coordinator.claimPairing({
        tournamentId: 't-claim-release',
        pairingId: pairing.pairingId,
        matchId: 'm-claim-temp',
      });

      const releaseRes = await coordinator.releasePairingClaim({
        tournamentId: 't-claim-release',
        pairingId: pairing.pairingId,
        matchId: 'm-claim-temp',
      });

      expect(releaseRes.released).toBe(true);
      expect(releaseRes.pairing.status).toBe('scheduled');
      expect(releaseRes.pairing.matchId).toBeNull();

      const snapshot = (await repository.load('t-claim-release'))!;
      const pInSnapshot = snapshot.rounds[0]!.pairings.find(p => p.pairingId === pairing.pairingId)!;
      expect(pInSnapshot.status).toBe('scheduled');
    });
  });

  describe('BO3 Order, Series Identity & Durable Replay Checkpoints', () => {
    it('enforces sequential game order and rejects out-of-order games', async () => {
      const tournament = createRoundRobinTournament('t-bo3-order', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      // Attempt Game 2 directly when Game 1 has not been played
      const game2: TournamentSeriesGameRecord = {
        gameNumber: 2,
        matchId: `g2-${pairing.pairingId}`,
        participantA: pairing.participantA,
        participantB: pairing.participantB!,
        winner: 'A',
        winnerParticipantId: pairing.participantA,
        terminationReason: 'goal_reached',
        turnCount: 20,
        durationMs: 200,
        replayRef: `g2-${pairing.pairingId}`,
        completedAt: new Date().toISOString(),
      };

      await expect(
        coordinator.checkpointSeriesGame({
          tournamentId: 't-bo3-order',
          pairingId: pairing.pairingId,
          gameRecord: game2,
        })
      ).rejects.toThrow(InvalidGameOrderError);

      expect(coordinator.isLocked('t-bo3-order')).toBe(false);
    });

    it('persists durable game checkpoints that do not pollute listMatchResults until series commit', async () => {
      const tournament = createRoundRobinTournament('t-bo3-replays', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      // Game 1
      const game1: TournamentSeriesGameRecord = {
        gameNumber: 1,
        matchId: `g1-${pairing.pairingId}`,
        participantA: pairing.participantA,
        participantB: pairing.participantB!,
        winner: 'A',
        winnerParticipantId: pairing.participantA,
        terminationReason: 'goal_reached',
        turnCount: 20,
        durationMs: 200,
        replayRef: `g1-${pairing.pairingId}`,
        completedAt: new Date().toISOString(),
      };

      await coordinator.checkpointSeriesGame({
        tournamentId: 't-bo3-replays',
        pairingId: pairing.pairingId,
        gameRecord: game1,
      });

      // Verify game 1 replay can be loaded individually from FileTournamentRepository
      const loadedG1 = await repository.loadMatchResult('t-bo3-replays', game1.matchId);
      const loadedG1Replay = await repository.loadReplay('t-bo3-replays', game1.matchId);
      expect(loadedG1).not.toBeNull();
      expect(loadedG1Replay).not.toBeNull();

      // However, listMatchResults must EXCLUDE intermediate games (seriesGameOf filter)
      const listBeforeSeriesCommit = await repository.listMatchResults('t-bo3-replays');
      expect(listBeforeSeriesCommit).toHaveLength(0);

      // Game 2
      const game2: TournamentSeriesGameRecord = {
        gameNumber: 2,
        matchId: `g2-${pairing.pairingId}`,
        participantA: pairing.participantA,
        participantB: pairing.participantB!,
        winner: 'A',
        winnerParticipantId: pairing.participantA,
        terminationReason: 'goal_reached',
        turnCount: 22,
        durationMs: 220,
        replayRef: `g2-${pairing.pairingId}`,
        completedAt: new Date().toISOString(),
      };

      await coordinator.checkpointSeriesGame({
        tournamentId: 't-bo3-replays',
        pairingId: pairing.pairingId,
        gameRecord: game2,
      });

      // Series is now won 2-0. Committing aggregate series record:
      const seriesMatchId = `t-bo3-replays-${pairing.pairingId}`;
      const aggregateRecord: TournamentMatchRecord = {
        matchId: seriesMatchId,
        pairingId: pairing.pairingId,
        participantA: pairing.participantA,
        participantB: pairing.participantB!,
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 42,
        durationMs: 420,
        replayRef: seriesMatchId,
        completedAt: new Date().toISOString(),
        series: {
          format: 'bo3',
          bestOf: 3,
          seed: 'seed-bo3',
          games: [game1, game2],
          winsA: 2,
          winsB: 0,
          winner: 'A',
        },
      };

      await coordinator.commitMatchResult({
        tournamentId: 't-bo3-replays',
        pairingId: pairing.pairingId,
        matchResult: aggregateRecord,
      });

      // Now listMatchResults must contain exactly the 1 aggregate series record!
      const listAfterSeriesCommit = await repository.listMatchResults('t-bo3-replays');
      expect(listAfterSeriesCommit).toHaveLength(1);
      expect(listAfterSeriesCommit[0]!.matchId).toBe(seriesMatchId);
    });

    it('initializes BO2 format and bestOf: 2 for Group Stage pairings checkpointing games', async () => {
      const tournament = createMultiStageTournament({
        tournamentId: 't-group-bo2-format',
        name: 'Group Stage BO2 Test',
        participants: createParticipants(8),
      });
      const groupStage = tournament.stages.find(s => s.stageType === 'group_stage');
      expect(groupStage).toBeDefined();
      const groupPairing = groupStage!.groups![0].rounds[0].pairings[0];
      await repository.save(tournament);

      const game1: TournamentSeriesGameRecord = {
        gameNumber: 1,
        matchId: 't-group-bo2-g1',
        pairingId: groupPairing.pairingId,
        participantA: groupPairing.participantA,
        participantB: groupPairing.participantB,
        winner: 'A',
        terminationReason: 'normal',
        replayRef: 't-group-bo2-g1',
        completedAt: new Date().toISOString(),
      };

      const result = await coordinator.checkpointSeriesGame({
        tournamentId: 't-group-bo2-format',
        pairingId: groupPairing.pairingId,
        gameRecord: game1,
      });

      expect(result.seriesProgress.format).toBe('bo2');
      expect(result.seriesProgress.bestOf).toBe(2);

      const savedTournament = await repository.load('t-group-bo2-format');
      const savedGroupStage = savedTournament!.stages.find(s => s.stageType === 'group_stage');
      const savedPairing = savedGroupStage!.groups![0].rounds.flatMap(r => r.pairings).find(p => p.pairingId === groupPairing.pairingId);
      expect(savedPairing!.seriesProgress?.format).toBe('bo2');
      expect(savedPairing!.seriesProgress?.bestOf).toBe(2);
    });
  });

  describe('Crash-Window Reconciliation', () => {
    it('reconciles match results committed on disk when tournament.json write was interrupted', async () => {
      const tournament = createRoundRobinTournament('t-reconcile-crash', 4);
      await repository.save(tournament);

      const pairing1 = tournament.rounds[0]!.pairings[0]!;
      const pairing2 = tournament.rounds[0]!.pairings[1]!;

      // Pairing 1 is in_progress
      pairing1.status = 'in_progress';
      pairing1.matchId = `m-${pairing1.pairingId}`;
      // Pairing 2 is also in_progress
      pairing2.status = 'in_progress';
      pairing2.matchId = `m-${pairing2.pairingId}`;
      await repository.save(tournament);

      // Simulate crash window: pairing1 match artifacts were successfully committed to disk
      // via saveMatchResult, but tournament.json was NOT saved!
      const match1Record = createMockMatchRecord(pairing1.pairingId, pairing1.participantA, pairing1.participantB, 'A', pairing1.matchId);
      const match1Replay = createMockReplay(match1Record);
      await repository.saveMatchResult('t-reconcile-crash', match1Record.matchId, match1Record, match1Replay);

      // pairing2 was interrupted and never produced disk artifacts.

      // Run reconciliation
      const reconcileRes = await coordinator.reconcileTournament('t-reconcile-crash');
      expect(reconcileRes.success).toBe(true);
      expect(reconcileRes.reconciledCount).toBe(1);
      expect(reconcileRes.resetCount).toBe(1);

      // Verify pairing 1 is now completed in tournament.json
      const snapshot = (await repository.load('t-reconcile-crash'))!;
      const p1InSnapshot = snapshot.rounds[0]!.pairings.find(p => p.pairingId === pairing1.pairingId)!;
      const p2InSnapshot = snapshot.rounds[0]!.pairings.find(p => p.pairingId === pairing2.pairingId)!;

      expect(p1InSnapshot.status).toBe('completed');
      expect(p1InSnapshot.matchResult?.winner).toBe('A');

      // Verify abandoned pairing 2 was reset to scheduled
      expect(p2InSnapshot.status).toBe('scheduled');
      expect(p2InSnapshot.matchId).toBeNull();
    });
  });

  describe('Multi-Stage Exactly-Once Stage Transition with File Persistence', () => {
    it('triggers stage completion exactly once with real FileTournamentRepository', async () => {
      const participants = createParticipants(8);
      const tournament = createMultiStageTournament({
        tournamentId: 't-file-ms',
        name: 'Multi-Stage File Test',
        participants,
      });
      tournament.stageGating = 'manual';
      await repository.save(tournament);

      const groupStage = tournament.stages!.find(s => s.stageType === 'group_stage')!;
      const knockoutStage = tournament.stages!.find(s => s.stageType === 'knockout')!;

      expect(groupStage.status).toBe('in_progress');
      expect(knockoutStage.status).toBe('pending');

      const transitionEvents: StageTransitionEvent[] = [];
      coordinator.on('stageTransition', event => {
        transitionEvents.push(event);
      });

      const allGroupPairings = groupStage.groups!.flatMap(g => g.rounds.flatMap(r => r.pairings));
      expect(allGroupPairings).toHaveLength(12);

      // Complete first 11 matches
      for (let i = 0; i < 11; i++) {
        const p = allGroupPairings[i]!;
        await coordinator.commitMatchResult({
          tournamentId: 't-file-ms',
          pairingId: p.pairingId,
          matchResult: createMockMatchRecord(p.pairingId, p.participantA, p.participantB!, 'A'),
        });
      }

      // Concurrently commit the 12th final match
      const finalPairing = allGroupPairings[11]!;
      const finalRecord = createMockMatchRecord(finalPairing.pairingId, finalPairing.participantA, finalPairing.participantB!, 'A');

      const concurrent = Array.from({ length: 5 }, () =>
        coordinator.commitMatchResult({
          tournamentId: 't-file-ms',
          pairingId: finalPairing.pairingId,
          matchResult: finalRecord,
        })
      );

      const results = await Promise.all(concurrent);
      const committed = results.filter(r => r.committed).length;
      const idempotent = results.filter(r => r.idempotent).length;

      expect(committed).toBe(1);
      expect(idempotent).toBe(4);

      // Exactly once transitions
      const groupTrans = transitionEvents.filter(e => e.stageId === groupStage.stageId && e.toStatus === 'completed');

      expect(groupTrans).toHaveLength(1);

      const finalSnapshot = (await repository.load('t-file-ms'))!;
      const groupInSnapshot = finalSnapshot.stages!.find(s => s.stageId === groupStage.stageId)!;
      const koInSnapshot = finalSnapshot.stages!.find(s => s.stageId === knockoutStage.stageId)!;

      expect(groupInSnapshot.status).toBe('completed');
      expect(koInSnapshot.status).toBe('pending');
    });
  });

  describe('Concurrent Commits & Lost Updates Prevention with File Repository', () => {
    it('serializes 15 concurrent commits with zero lost updates on real disk', async () => {
      const tournament = createRoundRobinTournament('t-file-concurrent', 6); // 15 matches
      await repository.save(tournament);

      const allPairings = tournament.rounds.flatMap(r => r.pairings).filter(p => p.participantB !== null);
      expect(allPairings).toHaveLength(15);

      const promises = allPairings.map((p, idx) => {
        const winner = idx % 2 === 0 ? 'A' : 'B';
        const rec = createMockMatchRecord(p.pairingId, p.participantA, p.participantB, winner);
        return coordinator.commitMatchResult({
          tournamentId: 't-file-concurrent',
          pairingId: p.pairingId,
          matchResult: rec,
        });
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(15);
      expect(results.every(r => r.success && r.committed)).toBe(true);

      const snapshot = (await repository.load('t-file-concurrent'))!;
      const completedCount = snapshot.rounds.flatMap(r => r.pairings).filter(p => p.status === 'completed').length;
      expect(completedCount).toBe(15);
      expect(snapshot.status).toBe('completed');
    });
  });
});

// ============================================================================
// In-Memory Repository Concurrency & Logic Suite
// ============================================================================

class InMemoryTournamentRepository implements TournamentRepository {
  private tournaments = new Map<string, Tournament>();
  private matchResults = new Map<string, Map<string, { result: TournamentMatchRecord; replay: object }>>();

  public failNextSave = false;

  async save(tournament: Tournament): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('Simulated repository write failure');
    }
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
    return Array.from(tMap.values()).map(v => JSON.parse(JSON.stringify(v.result)));
  }
}

describe('TournamentCommitCoordinator - In-Memory Fast & Concurrency Suite', () => {
  let repository: InMemoryTournamentRepository;
  let coordinator: TournamentCommitCoordinator;

  beforeEach(() => {
    repository = new InMemoryTournamentRepository();
    coordinator = createTournamentCommitCoordinator(repository);
  });

  it('executes mutations on different tournaments concurrently without blocking', async () => {
    const tournA = createRoundRobinTournament('t-mem-alpha', 4);
    const tournB = createRoundRobinTournament('t-mem-beta', 4);
    await repository.save(tournA);
    await repository.save(tournB);

    const executionOrder: string[] = [];

    const promiseA = coordinator.mutateTournament('t-mem-alpha', async t => {
      executionOrder.push('alpha-start');
      await new Promise(r => setTimeout(r, 60));
      executionOrder.push('alpha-end');
      return t.tournamentId;
    });

    await new Promise(r => setTimeout(r, 10));

    const promiseB = coordinator.mutateTournament('t-mem-beta', async t => {
      executionOrder.push('beta-start');
      await new Promise(r => setTimeout(r, 10));
      executionOrder.push('beta-end');
      return t.tournamentId;
    });

    await Promise.all([promiseA, promiseB]);
    expect(executionOrder).toEqual(['alpha-start', 'beta-start', 'beta-end', 'alpha-end']);
  });

  it('guarantees lock release when a mutation operation throws an error', async () => {
    const tournament = createRoundRobinTournament('t-mem-fail', 4);
    await repository.save(tournament);

    await expect(
      coordinator.mutateTournament('t-mem-fail', async () => {
        throw new Error('Explosion during mutation logic');
      })
    ).rejects.toThrow('Explosion during mutation logic');

    expect(coordinator.isLocked('t-mem-fail')).toBe(false);
    expect(coordinator.getPendingCount('t-mem-fail')).toBe(0);

    const successRes = await coordinator.mutateTournament('t-mem-fail', async t => {
      t.name = 'Recovered Name';
      return 'success';
    });

    expect(successRes).toBe('success');
  });

  it('throws TournamentNotFoundError when tournament does not exist', async () => {
    await expect(
      coordinator.commitMatchResult({
        tournamentId: 't-mem-non-existent',
        pairingId: 'p-1',
        matchResult: createMockMatchRecord('p-1', 'bot-1', 'bot-2'),
      })
    ).rejects.toThrow(TournamentNotFoundError);

    expect(coordinator.isLocked('t-mem-non-existent')).toBe(false);
  });

  it('throws PairingNotFoundError for non-existent pairing', async () => {
    const tournament = createRoundRobinTournament('t-mem-bad-p', 4);
    await repository.save(tournament);

    await expect(
      coordinator.commitMatchResult({
        tournamentId: 't-mem-bad-p',
        pairingId: 'bad-pairing-id',
        matchResult: createMockMatchRecord('bad-pairing-id', 'bot-1', 'bot-2'),
      })
    ).rejects.toThrow(PairingNotFoundError);
  });
});

