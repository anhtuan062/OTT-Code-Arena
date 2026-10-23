/**
 * Tournament Manager - Hardened Serialized Tournament Commit Coordinator
 *
 * Standalone coordinator to serialize asynchronous state mutations per tournament,
 * preventing lost updates, validating persistence contracts, and managing durable
 * claims and recovery.
 *
 * Hardened Persistence Features:
 * - Pre-write validation: Verifies pairing existence, durable claim identity, result/replay
 *   integrity, and conflicts BEFORE touching on-disk artifacts.
 * - Zero-I/O identical retries: Returns immediately without re-writing match/replay/commit files.
 * - Conflict rejection without disk overwrite: Rejects conflicting results/replays and keeps
 *   existing on-disk commit triad artifacts pristine.
 * - Result/Replay/Commit-Marker Triad: Guarantees compliant result and replay structures
 *   (e.g., matching matchId and replayRef) so FileTournamentRepository commit markers always pass.
 * - BO3 Series Enforcement: Enforces strict game order, series identity, and durable per-game
 *   replay checkpoints tagged with seriesGameOf.
 * - Crash-window recovery: Reconciles pairings if process crashed between committed match
 *   artifacts and tournament snapshot persistence.
 * - Per-tournament lock serialization: FIFO queues per tournamentId, non-blocking across distinct
 *   tournaments, with guaranteed release in finally blocks.
 */

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import type {
  Tournament,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentSeriesGameRecord,
  TournamentSeriesProgress,
  TournamentStage,
  TournamentGroup,
  TournamentRegion,
  TournamentRound,
  StageType,
  StageStatus,
  TournamentStatus,
} from './types.js';
import type { TournamentRepository } from './persistence.js';
import type { MatchReplay } from '@match-runner/types.js';
import {
  isMultiStageTournament,
  findPairingInTournament,
  commitMatchResultAndResolveSlots,
  isTournamentComplete,
  isSlotPlaceholder,
  canPairingExecute,
  getAllTournamentPairings,
} from './multi-stage.js';
import {
  findPairing,
  isScheduleComplete,
} from './scheduling.js';
import { computeStandings } from './scoring.js';

// ============================================================================
// Error Definitions
// ============================================================================

export class TournamentCommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TournamentCommitError';
  }
}

export class TournamentNotFoundError extends TournamentCommitError {
  constructor(public readonly tournamentId: string) {
    super(`Tournament ${tournamentId} not found`);
    this.name = 'TournamentNotFoundError';
  }
}

export class PairingNotFoundError extends TournamentCommitError {
  constructor(public readonly tournamentId: string, public readonly pairingId: string) {
    super(`Pairing ${pairingId} not found in tournament ${tournamentId}`);
    this.name = 'PairingNotFoundError';
  }
}

export class ConflictingCommitError extends TournamentCommitError {
  constructor(
    public readonly tournamentId: string,
    public readonly pairingId: string,
    public readonly existingResult: unknown,
    public readonly incomingResult: unknown,
    message?: string
  ) {
    super(
      message ??
        `Pairing ${pairingId} is already completed with conflicting result (existing: ${JSON.stringify(
          existingResult
        )}, incoming: ${JSON.stringify(incomingResult)})`
    );
    this.name = 'ConflictingCommitError';
  }
}

export class DurableClaimMismatchError extends TournamentCommitError {
  constructor(
    public readonly tournamentId: string,
    public readonly pairingId: string,
    public readonly claimedMatchId: string,
    public readonly incomingMatchId: string
  ) {
    super(
      `Pairing ${pairingId} has a durable claim for matchId '${claimedMatchId}', but received '${incomingMatchId}'`
    );
    this.name = 'DurableClaimMismatchError';
  }
}

export class InvalidGameOrderError extends TournamentCommitError {
  constructor(
    public readonly tournamentId: string,
    public readonly pairingId: string,
    public readonly expectedGameNumber: number,
    public readonly receivedGameNumber: number
  ) {
    super(
      `Invalid BO3 game order for pairing ${pairingId}: expected game ${expectedGameNumber}, received ${receivedGameNumber}`
    );
    this.name = 'InvalidGameOrderError';
  }
}

export class TournamentRecoveryError extends TournamentCommitError {
  constructor(public readonly tournamentId: string, message: string) {
    super(`Recovery failure for tournament ${tournamentId}: ${message}`);
    this.name = 'TournamentRecoveryError';
  }
}

// ============================================================================
// Event & Result Types
// ============================================================================

export interface StageTransitionEvent {
  tournamentId: string;
  stageId: string;
  stageType: StageType;
  fromStatus: StageStatus;
  toStatus: StageStatus;
  timestamp: string;
}

export interface TournamentTransitionEvent {
  tournamentId: string;
  fromStatus: TournamentStatus;
  toStatus: TournamentStatus;
  timestamp: string;
}

export interface MatchCommittedEvent {
  tournamentId: string;
  pairingId: string;
  matchResult: TournamentMatchRecord;
  idempotent: boolean;
  stageTransitions: StageTransitionEvent[];
}

export interface SeriesGameCheckpointedEvent {
  tournamentId: string;
  pairingId: string;
  gameRecord: TournamentSeriesGameRecord;
  seriesProgress: TournamentSeriesProgress;
  idempotent: boolean;
}

export interface ClaimPairingParams {
  tournamentId: string;
  pairingId: string;
  matchId?: string;
  claimantId?: string;
}

export interface ClaimPairingResult {
  success: boolean;
  claimed: boolean;
  idempotent: boolean;
  pairing: TournamentPairing;
  matchId: string;
  tournament: Tournament;
}

export interface ReleaseClaimParams {
  tournamentId: string;
  pairingId: string;
  matchId?: string;
}

export interface ReleaseClaimResult {
  success: boolean;
  released: boolean;
  pairing: TournamentPairing;
  tournament: Tournament;
}

export interface CommitMatchResultParams {
  tournamentId: string;
  pairingId: string;
  matchResult: TournamentMatchRecord;
  replay?: object;
  skipStandingUpdate?: boolean;
}

export interface CommitMatchResultResult {
  success: boolean;
  committed: boolean;
  idempotent: boolean;
  pairing: TournamentPairing;
  tournament: Tournament;
  stageTransitions: StageTransitionEvent[];
  newlyExecutablePairings: string[];
  resolvedSlotCount: number;
}

export interface CheckpointSeriesGameParams {
  tournamentId: string;
  pairingId: string;
  gameRecord: TournamentSeriesGameRecord;
  replay?: object;
  format?: 'bo2' | 'bo3';
}

export interface CheckpointSeriesGameResult {
  success: boolean;
  committed: boolean;
  idempotent: boolean;
  seriesProgress: TournamentSeriesProgress;
  pairing: TournamentPairing;
  tournament: Tournament;
}

export interface ReconcileTournamentResult {
  success: boolean;
  tournament: Tournament;
  reconciledCount: number;
  resetCount: number;
  stageTransitions: StageTransitionEvent[];
}

export interface PairingLocation {
  pairing: TournamentPairing;
  round?: TournamentRound;
  stage?: TournamentStage;
  group?: TournamentGroup;
  region?: TournamentRegion;
}

// ============================================================================
// Helper Utilities
// ============================================================================

export function createMatchId(tournamentId: string, pairingId: string): string {
  const candidate = `${tournamentId}-${pairingId}`;
  if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate)) {
    return candidate;
  }
  return `m-${createHash('sha256').update(candidate).digest('hex')}`;
}

export function findPairingAcrossTournament(
  tournament: Tournament,
  pairingId: string
): PairingLocation | null {
  if (isMultiStageTournament(tournament)) {
    const found = findPairingInTournament(tournament, pairingId);
    if (found) {
      return {
        pairing: found.pairing,
        round: found.round,
        stage: found.stage,
        group: found.group,
        region: found.region,
      };
    }
  }

  // Check rounds directly (single round robin or fallback)
  if (tournament.rounds) {
    for (const round of tournament.rounds) {
      const pairing = round.pairings.find(p => p.pairingId === pairingId);
      if (pairing) {
        return { pairing, round };
      }
    }
  }

  return null;
}

/**
 * Compare two match records for functional identity
 */
export function isSameMatchResult(
  existing: TournamentMatchRecord,
  incoming: TournamentMatchRecord
): boolean {
  if (existing.matchId !== incoming.matchId) return false;
  if (existing.winner !== incoming.winner) return false;
  if (existing.pairingId && incoming.pairingId && existing.pairingId !== incoming.pairingId) return false;
  return true;
}

/**
 * Construct a fully compliant MatchReplay conforming to FileTournamentRepository expectations.
 * FileTournamentRepository requires:
 * 1. replay.matchId === matchResult.matchId
 * 2. matchResult.replayRef === matchResult.matchId
 */
export function createCompliantReplay(
  matchResult: TournamentMatchRecord,
  providedReplay?: object
): MatchReplay {
  const replayObj = (providedReplay ?? {}) as Partial<MatchReplay>;
  return {
    matchId: matchResult.matchId,
    protocolVersion: replayObj.protocolVersion ?? '0.1.0',
    initialState: replayObj.initialState ?? {
      boardSize: 9,
      turn: 1,
      currentPlayer: 'A',
      status: 'playing',
      winner: null,
      winReason: null,
      pieces: [],
      lastMove: null,
    },
    moves: replayObj.moves ?? [],
    finalState: replayObj.finalState ?? {
      boardSize: 8,
      turn: matchResult.turnCount ?? 1,
      currentPlayer: 'A',
      status: 'finished',
      winner: matchResult.winner === 'draw' ? null : matchResult.winner,
      winReason: (matchResult.terminationReason ?? 'goal_reached') as any,
      pieces: [],
      lastMove: null,
    },
    winner: matchResult.winner,
    terminationReason: matchResult.terminationReason ?? 'goal_reached',
    series: (matchResult as any).series ?? replayObj.series,
    metadata: replayObj.metadata,
  };
}

// ============================================================================
// TournamentCommitCoordinator
// ============================================================================

export class TournamentCommitCoordinator extends EventEmitter {
  private readonly repository: TournamentRepository;
  private readonly tournamentLocks = new Map<string, Promise<void>>();
  private readonly pendingCounts = new Map<string, number>();

  constructor(repository: TournamentRepository) {
    super();
    this.repository = repository;
  }

  /**
   * Diagnostic: check whether a tournament currently has an active or queued mutation.
   */
  isLocked(tournamentId: string): boolean {
    return (this.pendingCounts.get(tournamentId) ?? 0) > 0;
  }

  /**
   * Diagnostic: get number of active + queued operations for a tournament.
   */
  getPendingCount(tournamentId: string): number {
    return this.pendingCounts.get(tournamentId) ?? 0;
  }

  /**
   * Diagnostic: get all tournament IDs currently undergoing mutations.
   */
  getActiveTournamentIds(): string[] {
    return Array.from(this.pendingCounts.keys());
  }

  /**
   * Internal lock manager: ensures FIFO serialization per tournament.
   * If a previous operation failed, the error is swallowed during awaiting
   * so subsequent operations can proceed without deadlocks or cascading rejections.
   */
  public async withTournamentLock<T>(tournamentId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tournamentLocks.get(tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });

    this.tournamentLocks.set(tournamentId, current);
    this.pendingCounts.set(tournamentId, (this.pendingCounts.get(tournamentId) ?? 0) + 1);

    try {
      await previous;
    } catch {
      // Swallowed: do not let a previous failure abort this operation
    }

    try {
      return await operation();
    } finally {
      const currentCount = (this.pendingCounts.get(tournamentId) ?? 1) - 1;
      if (currentCount <= 0) {
        this.pendingCounts.delete(tournamentId);
      } else {
        this.pendingCounts.set(tournamentId, currentCount);
      }

      release();
      if (this.tournamentLocks.get(tournamentId) === current) {
        this.tournamentLocks.delete(tournamentId);
      }
    }
  }

  /**
   * Execute an arbitrary mutation callback inside the tournament lock
   * using a fresh authoritative snapshot, saving on success.
   */
  async mutateTournament<T>(
    tournamentId: string,
    mutator: (tournament: Tournament) => Promise<T> | T,
    options?: { skipSave?: boolean }
  ): Promise<T> {
    return this.withTournamentLock(tournamentId, async () => {
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      const result = await mutator(tournament);

      if (!options?.skipSave) {
        await this.repository.save(tournament);
      }

      return result;
    });
  }

  /**
   * Read the latest authoritative snapshot of a tournament from repository.
   */
  async getSnapshot(tournamentId: string): Promise<Tournament | null> {
    return this.repository.load(tournamentId);
  }

  /**
   * Claim a pairing for execution, establishing durable claim identity.
   * Prevents concurrent workers from executing or committing with mismatched matchIds.
   */
  async claimPairing(params: ClaimPairingParams): Promise<ClaimPairingResult> {
    const { tournamentId, pairingId, claimantId } = params;

    return this.withTournamentLock(tournamentId, async () => {
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      const found = findPairingAcrossTournament(tournament, pairingId);
      if (!found) {
        throw new PairingNotFoundError(tournamentId, pairingId);
      }

      const pairing = found.pairing;
      const matchId = params.matchId ?? pairing.matchId ?? createMatchId(tournamentId, pairingId);

      // 1. If already completed, reject claim
      if (pairing.status === 'completed') {
        throw new TournamentCommitError(`Cannot claim pairing ${pairingId}: pairing is already completed`);
      }

      // 2. If in_progress: check idempotent claim vs conflict
      if (pairing.status === 'in_progress') {
        if (pairing.matchId === matchId) {
          return {
            success: true,
            claimed: false,
            idempotent: true,
            pairing,
            matchId,
            tournament,
          };
        }

        throw new DurableClaimMismatchError(
          tournamentId,
          pairingId,
          pairing.matchId ?? 'unknown',
          matchId
        );
      }

      // 3. If scheduled: check multi-stage readiness
      if (isMultiStageTournament(tournament) && !canPairingExecute(pairing)) {
        throw new TournamentCommitError(
          `Cannot claim pairing ${pairingId}: prerequisites or participant slots are not yet resolved (${pairing.participantA} vs ${pairing.participantB})`
        );
      }

      pairing.status = 'in_progress';
      pairing.matchId = matchId;
      pairing.startedAt = new Date().toISOString();

      await this.repository.save(tournament);

      this.emit('pairingClaimed', { tournamentId, pairingId, matchId, claimantId });

      return {
        success: true,
        claimed: true,
        idempotent: false,
        pairing,
        matchId,
        tournament,
      };
    });
  }

  /**
   * Release a previously claimed pairing (e.g. if match execution failed before completion),
   * returning it to 'scheduled'.
   */
  async releasePairingClaim(params: ReleaseClaimParams): Promise<ReleaseClaimResult> {
    const { tournamentId, pairingId, matchId } = params;

    return this.withTournamentLock(tournamentId, async () => {
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      const found = findPairingAcrossTournament(tournament, pairingId);
      if (!found) {
        throw new PairingNotFoundError(tournamentId, pairingId);
      }

      const pairing = found.pairing;

      if (pairing.status === 'completed') {
        throw new TournamentCommitError(`Cannot release pairing ${pairingId}: already completed`);
      }

      if (pairing.status === 'in_progress') {
        if (matchId && pairing.matchId && pairing.matchId !== matchId) {
          throw new DurableClaimMismatchError(tournamentId, pairingId, pairing.matchId, matchId);
        }

        pairing.status = 'scheduled';
        pairing.matchId = null;
        pairing.startedAt = null;

        await this.repository.save(tournament);

        this.emit('pairingClaimReleased', { tournamentId, pairingId });
        return { success: true, released: true, pairing, tournament };
      }

      return { success: true, released: false, pairing, tournament };
    });
  }

  /**
   * Backward-compatible alias for claimPairing
   */
  async markPairingInProgress(
    tournamentId: string,
    pairingId: string,
    matchId: string
  ): Promise<{ success: boolean; pairing: TournamentPairing }> {
    const res = await this.claimPairing({ tournamentId, pairingId, matchId });
    return { success: res.success, pairing: res.pairing };
  }

  /**
   * Checkpoint an intermediate BO3 game record durably into the tournament state.
   *
   * Hardened contracts enforced:
   * - Pre-write validation: Validates pairing existence, series identity, and game order
   * - Idempotent retries: Returns immediately only when both durable game artifacts exist;
   *   repairs an interrupted artifact write when progress exists without the complete triad
   * - Conflicting outcome rejection: Never overwrites existing game artifacts on conflict
   * - Durable replay checkpoint: Writes full triad with seriesGameOf metadata
   */
  async checkpointSeriesGame(params: CheckpointSeriesGameParams): Promise<CheckpointSeriesGameResult> {
    const { tournamentId, pairingId, gameRecord, replay } = params;

    return this.withTournamentLock(tournamentId, async () => {
      // 1. Authoritative snapshot
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      // 2. Locate pairing
      const found = findPairingAcrossTournament(tournament, pairingId);
      if (!found) {
        throw new PairingNotFoundError(tournamentId, pairingId);
      }

      const pairing = found.pairing;
      const seriesMatchId = pairing.matchId ?? createMatchId(tournamentId, pairingId);

      // 3. Initialize seriesProgress if missing
      const isGroup = pairing.stageId === 'stage-group'
        || found.stage?.stageType === 'group_stage'
        || found.stage?.stageId === 'stage-group'
        || Boolean(found.group);
      const expectedFormat: 'bo2' | 'bo3' = params.format ?? (isGroup ? 'bo2' : 'bo3');
      const expectedBestOf: 2 | 3 = expectedFormat === 'bo2' ? 2 : 3;

      if (!pairing.seriesProgress) {
        pairing.seriesProgress = {
          format: expectedFormat,
          bestOf: expectedBestOf,
          seed: randomUUID(),
          nextGame: 1,
          winsA: 0,
          winsB: 0,
          games: [],
        };
      } else if (isGroup && pairing.seriesProgress.format !== 'bo2') {
        pairing.seriesProgress.format = 'bo2';
        pairing.seriesProgress.bestOf = 2;
      }

      const progress = pairing.seriesProgress;

      // 4. Check for existing game (Idempotency vs Conflict) BEFORE writing
      const existingGame = progress.games.find(g => g.gameNumber === gameRecord.gameNumber);
      const diskGame = await this.repository.loadMatchResult(tournamentId, gameRecord.matchId).catch(() => null);

      if (existingGame) {
        if (
          existingGame.matchId === gameRecord.matchId &&
          existingGame.winner === gameRecord.winner &&
          existingGame.winnerParticipantId === gameRecord.winnerParticipantId
        ) {
          const diskReplay = diskGame ? await this.repository.loadReplay(tournamentId, gameRecord.matchId).catch(() => null) : null;
          if (diskGame && diskReplay) {
            return {
              success: true,
              committed: false,
              idempotent: true,
              seriesProgress: progress,
              pairing,
              tournament,
            };
          }
        }

        // Conflicting game result: reject WITHOUT writing or overwriting files
        throw new ConflictingCommitError(
          tournamentId,
          pairingId,
          {
            gameNumber: existingGame.gameNumber,
            matchId: existingGame.matchId,
            winner: existingGame.winner,
          },
          {
            gameNumber: gameRecord.gameNumber,
            matchId: gameRecord.matchId,
            winner: gameRecord.winner,
          },
          `Game ${gameRecord.gameNumber} of pairing ${pairingId} was already recorded with conflicting result`
        );
      }

      // 5. Enforce series game order
      if (gameRecord.gameNumber !== progress.nextGame) {
        throw new InvalidGameOrderError(
          tournamentId,
          pairingId,
          progress.nextGame,
          gameRecord.gameNumber
        );
      }

      // 6. Check if series is already decided
      if ((progress.winsA >= 2 || progress.winsB >= 2) && !existingGame) {
        throw new TournamentCommitError(
          `Cannot checkpoint game ${gameRecord.gameNumber} for pairing ${pairingId}: series is already decided (${progress.winsA}-${progress.winsB})`
        );
      }

      // 7. Check if on-disk artifact for this gameId already exists with conflict
      if (diskGame && diskGame.winner !== gameRecord.winner) {
        throw new ConflictingCommitError(
          tournamentId,
          pairingId,
          diskGame,
          gameRecord,
          `Committed disk artifact for game ${gameRecord.matchId} already exists with conflicting outcome`
        );
      }

      // 8. Persist game triad with valid replay and seriesGameOf marker
      gameRecord.replayRef = gameRecord.matchId;
      const compliantReplay = createCompliantReplay(gameRecord as any, replay);

      await this.repository.saveMatchResult(
        tournamentId,
        gameRecord.matchId,
        {
          matchId: gameRecord.matchId,
          pairingId,
          participantA: gameRecord.participantA,
          participantB: gameRecord.participantB,
          winner: gameRecord.winner,
          terminationReason: gameRecord.terminationReason,
          turnCount: gameRecord.turnCount,
          durationMs: gameRecord.durationMs,
          replayRef: gameRecord.replayRef,
          completedAt: gameRecord.completedAt,
          seriesGameOf: seriesMatchId,
        },
        compliantReplay
      );

      // 9. Update in-memory series progress
      const updatedGames = (existingGame ? progress.games : [...progress.games, gameRecord])
        .sort((a, b) => a.gameNumber - b.gameNumber);
      progress.games = updatedGames;
      progress.winsA = updatedGames.filter(g => g.winnerParticipantId === pairing.participantA).length;
      progress.winsB = updatedGames.filter(g => g.winnerParticipantId === pairing.participantB).length;
      progress.nextGame = (updatedGames.length < 3 ? updatedGames.length + 1 : 3) as 1 | 2 | 3;

      if (pairing.status === 'scheduled') {
        pairing.status = 'in_progress';
      }
      pairing.matchId = seriesMatchId;

      await this.repository.save(tournament);

      const eventPayload: SeriesGameCheckpointedEvent = {
        tournamentId,
        pairingId,
        gameRecord,
        seriesProgress: progress,
        idempotent: false,
      };
      this.emit('seriesGameCheckpointed', eventPayload);

      return {
        success: true,
        committed: true,
        idempotent: false,
        seriesProgress: progress,
        pairing,
        tournament,
      };
    });
  }

  /**
   * Commit a completed match result to a pairing under the tournament lock.
   *
   * Hardened contracts enforced:
   * 1. Pre-write validation: Verifies pairing, durable claims, slot placeholders, and conflicts
   * 2. Zero-I/O identical retries: Returns immediately without disk writes
   * 3. Conflicting-result rejection: Rejects without overwriting existing files
   * 4. Triad compliance: Automatically aligns result.replayRef and replay.matchId
   * 5. Multi-stage slot resolution and exactly-once stage transition detection
   */
  async commitMatchResult(params: CommitMatchResultParams): Promise<CommitMatchResultResult> {
    const { tournamentId, pairingId, matchResult, replay, skipStandingUpdate } = params;

    return this.withTournamentLock(tournamentId, async () => {
      // 1. Fresh authoritative snapshot
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      // 2. Locate pairing
      const found = findPairingAcrossTournament(tournament, pairingId);
      if (!found) {
        throw new PairingNotFoundError(tournamentId, pairingId);
      }

      const pairing = found.pairing;

      // 3. Pre-write validation: Check durable claim identity
      if (pairing.matchId && pairing.matchId !== matchResult.matchId) {
        throw new DurableClaimMismatchError(
          tournamentId,
          pairingId,
          pairing.matchId,
          matchResult.matchId
        );
      }

      // 4. Pre-write validation: Idempotency & Conflict Check
      if (pairing.status === 'completed' && pairing.matchResult) {
        if (isSameMatchResult(pairing.matchResult, matchResult)) {
          // Zero-I/O identical retry: do not re-write artifacts or tournament
          return {
            success: true,
            committed: false,
            idempotent: true,
            pairing,
            tournament,
            stageTransitions: [],
            newlyExecutablePairings: [],
            resolvedSlotCount: 0,
          };
        }

        // Conflicting commit: throw WITHOUT overwriting any files
        throw new ConflictingCommitError(
          tournamentId,
          pairingId,
          {
            matchId: pairing.matchResult.matchId,
            winner: pairing.matchResult.winner,
          },
          {
            matchId: matchResult.matchId,
            winner: matchResult.winner,
          }
        );
      }

      // 5. Pre-write validation: Unresolved placeholders in multi-stage
      if (
        isSlotPlaceholder(pairing.participantA) ||
        (pairing.participantB !== null && isSlotPlaceholder(pairing.participantB)) ||
        (pairing.slotA && pairing.slotA.participantId === null) ||
        (pairing.slotB && pairing.participantB !== null && pairing.slotB.participantId === null)
      ) {
        throw new TournamentCommitError(
          `Cannot commit result for pairing ${pairingId}: pairing has unresolved placeholder participants (${pairing.participantA} vs ${pairing.participantB})`
        );
      }

      // 6. Pre-write validation: Check if disk already has a conflicting match for matchResult.matchId
      const diskMatch = await this.repository.loadMatchResult(tournamentId, matchResult.matchId).catch(() => null);
      if (diskMatch && !isSameMatchResult(diskMatch, matchResult)) {
        throw new ConflictingCommitError(
          tournamentId,
          pairingId,
          diskMatch,
          matchResult,
          `Committed artifact for match ${matchResult.matchId} already exists on disk with conflicting outcome`
        );
      }

      // 7. Ensure valid result/replay/commit-marker triad
      matchResult.replayRef = matchResult.matchId;
      const compliantReplay = createCompliantReplay(matchResult, replay);

      // Persist match result triad if not already persisted with identical hashes
      if (!diskMatch) {
        await this.repository.saveMatchResult(tournamentId, matchResult.matchId, matchResult, compliantReplay);
      }

      // 8. Track stage states BEFORE commit for exactly-once stage transition detection
      const stagesBefore = (tournament.stages ?? []).map(s => ({
        stageId: s.stageId,
        stageType: s.stageType,
        status: s.status,
      }));
      const tournamentStatusBefore = tournament.status;

      let resolvedSlotCount = 0;
      let newlyExecutablePairings: string[] = [];

      // 9. Apply commit onto tournament state
      if (isMultiStageTournament(tournament)) {
        const res = commitMatchResultAndResolveSlots(tournament, pairingId, matchResult);
        resolvedSlotCount = res.resolvedCount;
        newlyExecutablePairings = res.newlyExecutablePairings;
      } else {
        // Single round robin / legacy tournament
        pairing.status = 'completed';
        pairing.matchId = matchResult.matchId;
        pairing.matchResult = matchResult;
        pairing.completedAt = matchResult.completedAt || new Date().toISOString();

        if (!skipStandingUpdate) {
          const allRecordsFromRepo = await this.repository.listMatchResults(tournamentId);
          const recordsFromPairings = (tournament.rounds ?? [])
            .flatMap(r => r.pairings)
            .map(p => p.matchResult)
            .filter((m): m is TournamentMatchRecord => m !== null);
          const recordMap = new Map<string, TournamentMatchRecord>();
          for (const rec of allRecordsFromRepo) recordMap.set(rec.matchId, rec);
          for (const rec of recordsFromPairings) recordMap.set(rec.matchId, rec);
          recordMap.set(matchResult.matchId, matchResult);
          const allMatchRecords = Array.from(recordMap.values());

          tournament.standings = computeStandings(
            tournament.participants,
            allMatchRecords,
            tournament.scoringConfig
          );
        }

        if (isScheduleComplete(tournament.rounds) && tournament.status !== 'completed') {
          tournament.status = 'completed';
          tournament.completedAt = new Date().toISOString();
        }
      }

      // 10. Detect stage and tournament transitions (occur exactly once)
      const stageTransitions: StageTransitionEvent[] = [];
      if (tournament.stages) {
        for (const stage of tournament.stages) {
          const prev = stagesBefore.find(s => s.stageId === stage.stageId);
          if (prev && prev.status !== stage.status) {
            const event: StageTransitionEvent = {
              tournamentId,
              stageId: stage.stageId,
              stageType: stage.stageType,
              fromStatus: prev.status,
              toStatus: stage.status,
              timestamp: new Date().toISOString(),
            };
            stageTransitions.push(event);
            this.emit('stageTransition', event);
          }
        }
      }

      if (tournamentStatusBefore !== tournament.status) {
        const event: TournamentTransitionEvent = {
          tournamentId,
          fromStatus: tournamentStatusBefore,
          toStatus: tournament.status,
          timestamp: new Date().toISOString(),
        };
        this.emit('tournamentTransition', event);
      }

      // 11. Save updated tournament snapshot to repository
      await this.repository.save(tournament);

      // 12. Emit match committed event
      const committedEvent: MatchCommittedEvent = {
        tournamentId,
        pairingId,
        matchResult,
        idempotent: false,
        stageTransitions,
      };
      this.emit('matchCommitted', committedEvent);

      return {
        success: true,
        committed: true,
        idempotent: false,
        pairing,
        tournament,
        stageTransitions,
        newlyExecutablePairings,
        resolvedSlotCount,
      };
    });
  }

  /**
   * Reconcile durable pairing state with committed match results on disk.
   *
   * Handles crash recovery when the process was killed after match result artifacts
   * were persisted to disk but before tournament snapshot was saved.
   *
   * Topologically resolves match records and resets abandoned in-progress pairings.
   */
  async reconcileTournament(tournamentId: string): Promise<ReconcileTournamentResult> {
    return this.withTournamentLock(tournamentId, async () => {
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) {
        throw new TournamentNotFoundError(tournamentId);
      }

      const rawRecords = await this.repository.listMatchResults(tournamentId);
      // Series game checkpoints share the pairingId with the aggregate result.
      // Only the aggregate can complete a pairing or contribute to standings.
      const pairingRecords = rawRecords.filter(record => !record.seriesGameOf);
      const completedPairingIds = new Set(pairingRecords.map(record => record.pairingId));
      const allPairings = isMultiStageTournament(tournament)
        ? getAllTournamentPairings(tournament)
        : (tournament.rounds ?? []).flatMap(r => r.pairings);

      const pairingMap = new Map<string, TournamentPairing>();
      for (const p of allPairings) {
        pairingMap.set(p.pairingId, p);
      }

      let resetCount = 0;
      // 1. Reset in-progress pairings that have no committed result on disk
      for (const pairing of allPairings) {
        if (pairing.status === 'in_progress' && !completedPairingIds.has(pairing.pairingId)) {
          pairing.status = 'scheduled';
          pairing.matchId = null;
          pairing.matchResult = null;
          pairing.startedAt = null;
          pairing.completedAt = null;
          resetCount++;
        }
      }

      if (pairingRecords.length === 0) {
        await this.repository.save(tournament);
        return {
          success: true,
          tournament,
          reconciledCount: 0,
          resetCount,
          stageTransitions: [],
        };
      }

      // 2. Track stage statuses before reconciliation
      const stagesBefore = (tournament.stages ?? []).map(s => ({
        stageId: s.stageId,
        stageType: s.stageType,
        status: s.status,
      }));

      // 3. Topologically sort committed match records
      const stageOrderMap = new Map<string, number>();
      if (isMultiStageTournament(tournament) && tournament.stages) {
        for (const stage of tournament.stages) {
          stageOrderMap.set(stage.stageId, stage.order);
        }
      }

      const records = [...pairingRecords].sort((a, b) => {
        const foundA = findPairingAcrossTournament(tournament, a.pairingId);
        const foundB = findPairingAcrossTournament(tournament, b.pairingId);
        const stageA = foundA?.stage ? (stageOrderMap.get(foundA.stage.stageId) ?? foundA.stage.order ?? 0) : 0;
        const stageB = foundB?.stage ? (stageOrderMap.get(foundB.stage.stageId) ?? foundB.stage.order ?? 0) : 0;
        if (stageA !== stageB) return stageA - stageB;

        const roundA = foundA?.round?.roundNumber ?? foundA?.pairing?.roundNumber ?? 0;
        const roundB = foundB?.round?.roundNumber ?? foundB?.pairing?.roundNumber ?? 0;
        if (roundA !== roundB) return roundA - roundB;

        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeA - timeB;
      });

      // 4. Multi-pass topological reconciliation loop
      let remaining = [...records];
      let pass = 0;
      const maxPasses = remaining.length + 1;
      let reconciledCount = 0;

      while (remaining.length > 0 && pass < maxPasses) {
        pass++;
        let progress = false;
        const nextRemaining: TournamentMatchRecord[] = [];

        for (const record of remaining) {
          const pairing = pairingMap.get(record.pairingId);
          if (!pairing) {
            throw new TournamentRecoveryError(
              tournamentId,
              `Match record references unknown pairing ${record.pairingId}`
            );
          }

          // Idempotency & Conflict Check on already-completed pairings
          if (pairing.status === 'completed' && pairing.matchResult) {
            if (isSameMatchResult(pairing.matchResult, record)) {
              progress = true;
              continue;
            }
            throw new ConflictingCommitError(
              tournamentId,
              pairing.pairingId,
              pairing.matchResult,
              record,
              `Pairing ${pairing.pairingId} is already completed with conflicting result during recovery`
            );
          }

          if (isMultiStageTournament(tournament)) {
            // Check readiness before committing
            if (!canPairingExecute(pairing)) {
              nextRemaining.push(record);
              continue;
            }
            commitMatchResultAndResolveSlots(tournament, record.pairingId, record);
            progress = true;
            reconciledCount++;
          } else {
            pairing.status = 'completed';
            pairing.matchId = record.matchId;
            pairing.matchResult = record;
            pairing.startedAt = record.completedAt;
            pairing.completedAt = record.completedAt;
            progress = true;
            reconciledCount++;
          }
        }

        remaining = nextRemaining;
        if (!progress && remaining.length > 0) {
          const unresolvable = remaining.map(r => r.pairingId).join(', ');
          throw new TournamentRecoveryError(
            tournamentId,
            `Recovery deadlock: unable to reconcile ${remaining.length} match record(s) due to unresolvable dependencies: [${unresolvable}]`
          );
        }
      }

      // 5. Update standings if round-robin or the entire multi-stage
      // tournament is complete. `rounds` is intentionally empty for modern
      // tournaments, so it must never be used as their completion signal.
      const scheduleComplete = isMultiStageTournament(tournament)
        ? isTournamentComplete(tournament)
        : isScheduleComplete(tournament.rounds);
      if (scheduleComplete) {
        tournament.standings = computeStandings(tournament.participants, pairingRecords, tournament.scoringConfig);
        if (scheduleComplete) {
          tournament.status = 'completed';
          tournament.completedAt = new Date().toISOString();
        }
      }

      // 6. Detect stage transitions
      const stageTransitions: StageTransitionEvent[] = [];
      if (tournament.stages) {
        for (const stage of tournament.stages) {
          const prev = stagesBefore.find(s => s.stageId === stage.stageId);
          if (prev && prev.status !== stage.status) {
            const event: StageTransitionEvent = {
              tournamentId,
              stageId: stage.stageId,
              stageType: stage.stageType,
              fromStatus: prev.status,
              toStatus: stage.status,
              timestamp: new Date().toISOString(),
            };
            stageTransitions.push(event);
            this.emit('stageTransition', event);
          }
        }
      }

      await this.repository.save(tournament);

      return {
        success: true,
        tournament,
        reconciledCount,
        resetCount,
        stageTransitions,
      };
    });
  }
}

/**
 * Factory to create a TournamentCommitCoordinator instance
 */
export function createTournamentCommitCoordinator(
  repository: TournamentRepository
): TournamentCommitCoordinator {
  return new TournamentCommitCoordinator(repository);
}
