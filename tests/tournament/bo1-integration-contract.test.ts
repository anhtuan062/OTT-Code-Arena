/**
 * Independent BO1 Integration Contract Verification Test Suite
 *
 * Validates the hardened scheduler and coordinator contract against real
 * FileTournamentRepository persistence on the local filesystem:
 *
 * 1. Durable claim before execution (pairing is in_progress on disk before executor runs)
 * 2. Same vs. different matchId retries (idempotent renewal vs. DurableClaimMismatchError)
 * 3. Zero-I/O idempotency (no disk artifact modification on identical retry)
 * 4. Result/replay/commit-marker integrity (triad presence and hash validation)
 * 5. Concurrent claim rejection (two workers attempting simultaneous claims on the same pairing)
 * 6. Crash after artifact save (match triad committed to disk, tournament.json not updated)
 * 7. Recovery without duplicate execution (reconcileTournament heals pairing without re-run)
 * 8. End-to-end parallel scheduler execution with coordinator durable hooks (maxConcurrentMatches: 2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  Tournament,
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentPairing,
} from '@tournament/types.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import type { MatchReplay } from '@match-runner/types.js';
import {
  TournamentCommitCoordinator,
  createTournamentCommitCoordinator,
  DurableClaimMismatchError,
  ConflictingCommitError,
  createMatchId,
} from '@tournament/commit-coordinator.js';
import {
  MatchScheduler,
  runParallelMatchScheduler,
  MatchSchedulerExecutor,
} from '@tournament/match-scheduler.js';
import { generateRoundRobinSchedule } from '@tournament/scheduling.js';
import { createMultiStageTournament } from '@tournament/multi-stage.js';

// ============================================================================
// Fixture Helpers
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
    name: `Contract Test RR ${tournamentId}`,
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
    turnCount: 12,
    durationMs: 150,
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
// Integration Contract Verification Suite
// ============================================================================

describe('BO1 Integration Contract Verification (FileTournamentRepository)', () => {
  let baseDir: string;
  let repository: FileTournamentRepository;
  let coordinator: TournamentCommitCoordinator;

  beforeEach(async () => {
    baseDir = path.join(os.tmpdir(), `ott-bo1-contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

  describe('1. Durable Claim Before Execution', () => {
    it('persists in_progress claim to disk before executor begins and blocks unearned execution', async () => {
      const tournament = createRoundRobinTournament('t-claim-pre', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchId = `exec-match-${pairing.pairingId}`;

      let executed = false;
      let pairingStatusAtExecutionStart: string | undefined;

      const executor: MatchSchedulerExecutor<TournamentMatchRecord> = {
        async execute(p) {
          // Verify on-disk authoritative state at the moment the executor runs
          const freshOnDisk = await repository.load('t-claim-pre');
          const onDiskPairing = freshOnDisk?.rounds[0]?.pairings.find(item => item.pairingId === p.pairingId);
          pairingStatusAtExecutionStart = onDiskPairing?.status;
          executed = true;

          return createMockMatchRecord(p.pairingId, p.participantA, p.participantB, 'A', matchId);
        },
      };

      // Scheduler configured with durable coordinator claim hook
      const scheduler = new MatchScheduler(executor, {
        concurrency: 1,
        claim: async p => {
          const res = await coordinator.claimPairing({
            tournamentId: 't-claim-pre',
            pairingId: p.pairingId,
            matchId,
          });
          return { claimId: res.matchId, pairing: res.pairing };
        },
        refresh: async () => {
          return (await repository.load('t-claim-pre'))!;
        },
        onComplete: async (p, result) => {
          await coordinator.commitMatchResult({
            tournamentId: 't-claim-pre',
            pairingId: p.pairingId,
            matchResult: result,
          });
        },
      });

      const scheduleResult = await scheduler.run(tournament);

      expect(executed).toBe(true);
      expect(pairingStatusAtExecutionStart).toBe('in_progress');
      expect(scheduleResult.completed).toHaveLength(1);
    });

    it('does not invoke executor for a pairing if its durable claim is rejected', async () => {
      const tournament = createRoundRobinTournament('t-claim-fail', 4);
      await repository.save(tournament);

      const targetPairing = tournament.rounds[0]!.pairings[0]!;
      const executedPairings: string[] = [];

      const executor: MatchSchedulerExecutor = {
        async execute(p) {
          executedPairings.push(p.pairingId);
          return createMockMatchRecord(p.pairingId, p.participantA, p.participantB, 'A', p.matchId ?? undefined);
        },
      };

      const scheduler = new MatchScheduler(executor, {
        concurrency: 1,
        claim: async p => {
          if (p.pairingId === targetPairing.pairingId) {
            return false; // claim rejected for targetPairing
          }
          const res = await coordinator.claimPairing({
            tournamentId: 't-claim-fail',
            pairingId: p.pairingId,
          });
          return { claimId: res.matchId, pairing: res.pairing };
        },
        refresh: async () => (await repository.load('t-claim-fail'))!,
        onComplete: async (p, res) => {
          await coordinator.commitMatchResult({
            tournamentId: 't-claim-fail',
            pairingId: p.pairingId,
            matchResult: res as TournamentMatchRecord,
          });
        },
      });

      await scheduler.run(tournament);
      expect(executedPairings).not.toContain(targetPairing.pairingId);
    });
  });

  describe('2. Same / Different MatchId Retries', () => {
    it('handles same matchId claim as idempotent confirmation', async () => {
      const tournament = createRoundRobinTournament('t-same-claim', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchId = `claim-${pairing.pairingId}`;

      const res1 = await coordinator.claimPairing({
        tournamentId: 't-same-claim',
        pairingId: pairing.pairingId,
        matchId,
      });
      expect(res1.claimed).toBe(true);
      expect(res1.idempotent).toBe(false);

      // Re-claim with same matchId
      const res2 = await coordinator.claimPairing({
        tournamentId: 't-same-claim',
        pairingId: pairing.pairingId,
        matchId,
      });
      expect(res2.claimed).toBe(false);
      expect(res2.idempotent).toBe(true);
      expect(res2.matchId).toBe(matchId);
    });

    it('rejects claim retry with different matchId with DurableClaimMismatchError', async () => {
      const tournament = createRoundRobinTournament('t-diff-claim', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      await coordinator.claimPairing({
        tournamentId: 't-diff-claim',
        pairingId: pairing.pairingId,
        matchId: 'worker-1-match',
      });

      // Worker 2 attempts to claim same pairing with different matchId
      await expect(
        coordinator.claimPairing({
          tournamentId: 't-diff-claim',
          pairingId: pairing.pairingId,
          matchId: 'worker-2-match',
        })
      ).rejects.toThrow(DurableClaimMismatchError);
    });

    it('rejects commit with different matchId than the durable claim', async () => {
      const tournament = createRoundRobinTournament('t-diff-commit', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const claimId = `claimed-match-${pairing.pairingId}`;

      await coordinator.claimPairing({
        tournamentId: 't-diff-commit',
        pairingId: pairing.pairingId,
        matchId: claimId,
      });

      // Worker tries to commit with a different matchId
      const conflictingRecord = createMockMatchRecord(
        pairing.pairingId,
        pairing.participantA,
        pairing.participantB,
        'A',
        'rogue-match-id'
      );

      await expect(
        coordinator.commitMatchResult({
          tournamentId: 't-diff-commit',
          pairingId: pairing.pairingId,
          matchResult: conflictingRecord,
        })
      ).rejects.toThrow(DurableClaimMismatchError);
    });
  });

  describe('3. Zero-I/O Idempotency & Artifact Integrity', () => {
    it('verifies commit marker triad on disk and ensures identical re-commits perform zero I/O', async () => {
      const tournament = createRoundRobinTournament('t-zero-io-contract', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A');
      const replay = createMockReplay(matchRecord);

      // Initial commit
      const res1 = await coordinator.commitMatchResult({
        tournamentId: 't-zero-io-contract',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
        replay,
      });
      expect(res1.committed).toBe(true);

      // Verify the 3-file triad on disk
      const dir = path.join(baseDir, 't-zero-io-contract');
      const resultFile = path.join(dir, `match-${matchRecord.matchId}.json`);
      const replayFile = path.join(dir, `replay-${matchRecord.matchId}.json`);
      const commitFile = path.join(dir, `match-${matchRecord.matchId}.commit.json`);
      const tournFile = path.join(dir, 'tournament.json');

      expect(await fs.access(resultFile).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(replayFile).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(commitFile).then(() => true).catch(() => false)).toBe(true);

      // Verify repository load passes hash verification
      const loaded = await repository.loadMatchResult('t-zero-io-contract', matchRecord.matchId);
      expect(loaded?.winner).toBe('A');

      // Record timestamps before retry
      const stat1Result = await fs.stat(resultFile);
      const stat1Replay = await fs.stat(replayFile);
      const stat1Commit = await fs.stat(commitFile);
      const stat1Tourn = await fs.stat(tournFile);

      // Wait a moment
      await new Promise(r => setTimeout(r, 25));

      // Identical re-commit
      const res2 = await coordinator.commitMatchResult({
        tournamentId: 't-zero-io-contract',
        pairingId: pairing.pairingId,
        matchResult: matchRecord,
        replay,
      });

      expect(res2.committed).toBe(false);
      expect(res2.idempotent).toBe(true);

      // Verify file modification times are byte-for-byte and millisecond-for-millisecond untouched
      const stat2Result = await fs.stat(resultFile);
      const stat2Replay = await fs.stat(replayFile);
      const stat2Commit = await fs.stat(commitFile);
      const stat2Tourn = await fs.stat(tournFile);

      expect(stat2Result.mtimeMs).toBe(stat1Result.mtimeMs);
      expect(stat2Replay.mtimeMs).toBe(stat1Replay.mtimeMs);
      expect(stat2Commit.mtimeMs).toBe(stat1Commit.mtimeMs);
      expect(stat2Tourn.mtimeMs).toBe(stat1Tourn.mtimeMs);
    });
  });

  describe('4. Concurrent Claim Rejection', () => {
    it('guarantees mutual exclusion when two workers race to claim the same pairing', async () => {
      const tournament = createRoundRobinTournament('t-race-claims', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      // Two concurrent workers attempt to claim with their own worker IDs
      const claim1 = coordinator.claimPairing({
        tournamentId: 't-race-claims',
        pairingId: pairing.pairingId,
        matchId: 'worker-alpha-match',
      });

      const claim2 = coordinator.claimPairing({
        tournamentId: 't-race-claims',
        pairingId: pairing.pairingId,
        matchId: 'worker-beta-match',
      });

      const results = await Promise.allSettled([claim1, claim2]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly ONE claim must succeed; the other must fail with DurableClaimMismatchError
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason).toBeInstanceOf(DurableClaimMismatchError);

      // The on-disk state reflects the winner's matchId
      const finalSnapshot = (await repository.load('t-race-claims'))!;
      const pInSnapshot = finalSnapshot.rounds[0]!.pairings.find(p => p.pairingId === pairing.pairingId)!;
      expect(pInSnapshot.status).toBe('in_progress');
      expect(['worker-alpha-match', 'worker-beta-match']).toContain(pInSnapshot.matchId);
    });
  });

  describe('5. Crash After Artifact Save & Recovery Without Duplicate Execution', () => {
    it('reconciles pairing committed to disk when tournament.json write crashed, preventing duplicate execution', async () => {
      const tournament = createRoundRobinTournament('t-crash-recovery', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;
      const matchId = `match-${pairing.pairingId}`;

      // 1. Worker claims pairing
      await coordinator.claimPairing({
        tournamentId: 't-crash-recovery',
        pairingId: pairing.pairingId,
        matchId,
      });

      // 2. Simulate crash window:
      // The match result, replay, and commit-marker files are saved to repository on disk...
      const matchRecord = createMockMatchRecord(pairing.pairingId, pairing.participantA, pairing.participantB, 'A', matchId);
      const replay = createMockReplay(matchRecord);
      await repository.saveMatchResult('t-crash-recovery', matchId, matchRecord, replay);

      // ...BUT the process crashed before coordinator could execute `save(tournament)`!
      // Verify tournament.json on disk is still 'in_progress':
      const diskBeforeRecovery = (await repository.load('t-crash-recovery'))!;
      const pairingBeforeRecovery = diskBeforeRecovery.rounds[0]!.pairings.find(p => p.pairingId === pairing.pairingId)!;
      expect(pairingBeforeRecovery.status).toBe('in_progress');

      // 3. System restart: Coordinator runs reconciliation
      const reconcileResult = await coordinator.reconcileTournament('t-crash-recovery');
      expect(reconcileResult.success).toBe(true);
      expect(reconcileResult.reconciledCount).toBe(1);

      // Verify pairing in tournament.json is now completed with winner 'A'
      const diskAfterRecovery = (await repository.load('t-crash-recovery'))!;
      const pairingAfterRecovery = diskAfterRecovery.rounds[0]!.pairings.find(p => p.pairingId === pairing.pairingId)!;
      expect(pairingAfterRecovery.status).toBe('completed');
      expect(pairingAfterRecovery.matchResult?.winner).toBe('A');

      // 4. Verify scheduler will NOT select or duplicate this match
      let duplicateExecutionAttempted = false;
      const executor: MatchSchedulerExecutor = {
        async execute(p) {
          if (p.pairingId === pairing.pairingId) {
            duplicateExecutionAttempted = true;
          }
          return createMockMatchRecord(p.pairingId, p.participantA, p.participantB, 'B');
        },
      };

      const scheduler = new MatchScheduler(executor, {
        concurrency: 1,
        claim: async p => {
          try {
            await coordinator.claimPairing({
              tournamentId: 't-crash-recovery',
              pairingId: p.pairingId,
              matchId: `second-run-${p.pairingId}`,
            });
            return true;
          } catch {
            return false;
          }
        },
        refresh: async () => (await repository.load('t-crash-recovery'))!,
      });

      await scheduler.run(diskAfterRecovery);
      expect(duplicateExecutionAttempted).toBe(false);
    });

    it('resets uncommitted in_progress pairings to scheduled after an interrupted worker crash', async () => {
      const tournament = createRoundRobinTournament('t-abandoned-worker', 4);
      await repository.save(tournament);

      const pairing = tournament.rounds[0]!.pairings[0]!;

      // Worker claims pairing but crashes before writing any match result artifacts
      await coordinator.claimPairing({
        tournamentId: 't-abandoned-worker',
        pairingId: pairing.pairingId,
        matchId: 'crashed-worker-match',
      });

      // Run reconciliation
      const reconcileRes = await coordinator.reconcileTournament('t-abandoned-worker');
      expect(reconcileRes.resetCount).toBe(1);
      expect(reconcileRes.reconciledCount).toBe(0);

      // Pairing must be reset to 'scheduled' and ready for re-claim
      const snapshot = (await repository.load('t-abandoned-worker'))!;
      const p = snapshot.rounds[0]!.pairings.find(item => item.pairingId === pairing.pairingId)!;
      expect(p.status).toBe('scheduled');
      expect(p.matchId).toBeNull();
    });
  });

  describe('6. Parallel MatchScheduler (Concurrency = 2) with Coordinator Durable Hooks', () => {
    it('executes independent pairings concurrently and coordinates durable claims and commits to disk', async () => {
      // 4 participants round robin: Round 1 has 2 independent pairings (p1: bot-1 vs bot-4, p2: bot-2 vs bot-3)
      const tournament = createRoundRobinTournament('t-parallel-scheduler', 4);
      await repository.save(tournament);

      let peakConcurrency = 0;
      let activeConcurrency = 0;

      const executor: MatchSchedulerExecutor<TournamentMatchRecord> = {
        async execute(p) {
          activeConcurrency++;
          peakConcurrency = Math.max(peakConcurrency, activeConcurrency);
          // Simulate match execution delay
          await new Promise(r => setTimeout(r, 40));
          activeConcurrency--;

          return createMockMatchRecord(p.pairingId, p.participantA, p.participantB, 'A', p.matchId ?? undefined);
        },
      };

      const scheduler = new MatchScheduler(executor, {
        maxConcurrentMatches: 2,
        claim: async p => {
          const res = await coordinator.claimPairing({
            tournamentId: 't-parallel-scheduler',
            pairingId: p.pairingId,
          });
          return { claimId: res.matchId, pairing: res.pairing };
        },
        refresh: async () => (await repository.load('t-parallel-scheduler'))!,
        onComplete: async (p, result) => {
          await coordinator.commitMatchResult({
            tournamentId: 't-parallel-scheduler',
            pairingId: p.pairingId,
            matchResult: result,
          });
        },
      });

      const result = await scheduler.run(tournament);

      expect(peakConcurrency).toBe(2);
      expect(result.completed).toHaveLength(6); // 4 bots = 6 total round-robin matches across 3 rounds
      expect(result.failures).toHaveLength(0);

      // Verify all matches are saved on disk with valid commit triads
      const snapshot = (await repository.load('t-parallel-scheduler'))!;
      const allPairings = snapshot.rounds.flatMap(r => r.pairings);
      expect(allPairings).toHaveLength(6);
      for (const p of allPairings) {
        expect(p.status).toBe('completed');
        const matchResult = await repository.loadMatchResult('t-parallel-scheduler', p.matchId!);
        const replay = await repository.loadReplay('t-parallel-scheduler', p.matchId!);
        expect(matchResult).not.toBeNull();
        expect(replay).not.toBeNull();
      }
      expect(snapshot.status).toBe('completed');
    });
  });
});
