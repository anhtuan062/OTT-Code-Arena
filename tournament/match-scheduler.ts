import type { Tournament, TournamentPairing, TournamentStage } from './types.js';
import {
  canPairingExecute,
  getAllTournamentPairings,
  getCurrentStage,
  isMultiStageTournament,
} from './multi-stage.js';

export const DEFAULT_MATCH_SCHEDULER_CONCURRENCY = 1;
export const MAX_MATCH_SCHEDULER_CONCURRENCY = 2;

export interface MatchSchedulerExecutor<TResult = unknown> {
  execute(pairing: TournamentPairing, signal: AbortSignal): Promise<TResult>;
}

/** Successful claim returned by the durable claim hook. */
export interface MatchSchedulerClaim {
  claimId?: string;
  jobId?: string;
  fencingToken?: number;
  /** Optional authoritative pairing returned by the repository after claiming. */
  pairing?: TournamentPairing;
}

export type MatchSchedulerClaimResult = MatchSchedulerClaim | boolean | void;

export interface MatchSchedulerUnsettledClaim {
  pairingId: string;
  claim: MatchSchedulerClaim;
}

export interface MatchSchedulerCheckpoint {
  phase: 'refresh' | 'claim' | 'dispatch' | 'complete' | 'no_progress' | 'settled';
  pairingId?: string;
  activePairingIds: string[];
  completedCount: number;
  failureCount: number;
  pendingPairingIds: string[];
  currentStageId?: string;
  detail?: string;
}

export interface MatchSchedulerOptions<TResult = unknown> {
  /** Maximum number of independent pairings to execute at once. Defaults to 1. */
  concurrency?: number;
  /** Alias accepted for callers that use the terminology from the product requirement. */
  maxConcurrentMatches?: number;
  signal?: AbortSignal;
  /** Durable claim. The executor is never called when this hook rejects. */
  claim?: (pairing: TournamentPairing, signal: AbortSignal) => Promise<MatchSchedulerClaimResult>;
  /** Load the authoritative tournament snapshot before selecting more work. */
  refresh?: () => Promise<Tournament>;
  onComplete?: (pairing: TournamentPairing, result: TResult) => void | Promise<void>;
  /** Release executor-local resources after a worker settles. Durable claims remain visible for recovery. */
  cleanup?: (pairing: TournamentPairing, claim: MatchSchedulerClaim) => void | Promise<void>;
  /** Optional QA/diagnostic hook. It is never required for scheduling. */
  onCheckpoint?: (checkpoint: MatchSchedulerCheckpoint) => void;
}

export interface MatchSchedulerFailure {
  pairingId: string;
  error: unknown;
}

export interface MatchSchedulerResult<TResult = unknown> {
  completed: Array<{ pairingId: string; result: TResult }>;
  failures: MatchSchedulerFailure[];
  cancelled: boolean;
  unsettledClaims: MatchSchedulerUnsettledClaim[];
}

interface ActiveWorker<TResult> {
  pairing: TournamentPairing;
  sourcePairing: TournamentPairing;
  claim: MatchSchedulerClaim;
  participants: [string, string];
  promise: Promise<void>;
  result?: TResult;
  error?: unknown;
}

/**
 * Match-level scheduler for the first parallel execution phase.
 *
 * It deliberately does not persist tournaments or invoke TournamentManager.
 * In integration mode, claiming and refreshing are supplied by durable hooks;
 * the scheduler owns only local worker bookkeeping and eligibility selection.
 */
export class MatchScheduler<TResult = unknown> {
  private readonly concurrency: number;
  private readonly abortController = new AbortController();
  private readonly externalSignal?: AbortSignal;
  private readonly executor: MatchSchedulerExecutor<TResult>;
  private readonly claimHook?: MatchSchedulerOptions<TResult>['claim'];
  private readonly refreshHook?: MatchSchedulerOptions<TResult>['refresh'];
  private readonly onComplete?: MatchSchedulerOptions<TResult>['onComplete'];
  private readonly cleanupHook?: MatchSchedulerOptions<TResult>['cleanup'];
  private readonly checkpointHook?: MatchSchedulerOptions<TResult>['onCheckpoint'];
  private readonly claimed = new Set<string>();
  private readonly unsettled = new Map<string, MatchSchedulerUnsettledClaim>();
  private readonly rejectedClaims = new Set<string>();
  private readonly legacyLocalMutation: boolean;
  private dispatchStopped = false;
  private runPromise: Promise<MatchSchedulerResult<TResult>> | null = null;

  constructor(executor: MatchSchedulerExecutor<TResult>, options: MatchSchedulerOptions<TResult> = {}) {
    const requested = options.maxConcurrentMatches ?? options.concurrency ?? DEFAULT_MATCH_SCHEDULER_CONCURRENCY;
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_MATCH_SCHEDULER_CONCURRENCY) {
      throw new RangeError(
        `Match scheduler concurrency must be an integer between 1 and ${MAX_MATCH_SCHEDULER_CONCURRENCY}`
      );
    }

    this.concurrency = requested;
    this.executor = executor;
    this.claimHook = options.claim;
    this.refreshHook = options.refresh;
    this.externalSignal = options.signal;
    this.onComplete = options.onComplete;
    this.cleanupHook = options.cleanup;
    this.checkpointHook = options.onCheckpoint;
    this.legacyLocalMutation = !this.claimHook && !this.refreshHook;

    if (this.externalSignal) {
      if (this.externalSignal.aborted) this.abortController.abort(this.externalSignal.reason);
      else this.externalSignal.addEventListener('abort', () => this.abortController.abort(this.externalSignal?.reason), { once: true });
    }
  }

  /** Request cancellation. The scheduler stops claiming work and waits for workers to settle. */
  cancel(reason?: unknown): void {
    if (!this.abortController.signal.aborted) this.abortController.abort(reason);
  }

  /** Stop claiming new pairings while allowing active workers to commit. */
  stopDispatching(): void {
    this.dispatchStopped = true;
  }

  run(tournament: Tournament): Promise<MatchSchedulerResult<TResult>> {
    if (this.runPromise) return this.runPromise;
    this.runPromise = this.runInternal(tournament);
    return this.runPromise;
  }

  private async runInternal(tournament: Tournament): Promise<MatchSchedulerResult<TResult>> {
    const completed: Array<{ pairingId: string; result: TResult }> = [];
    const failures: MatchSchedulerFailure[] = [];
    const active = new Map<string, ActiveWorker<TResult>>();
    let authoritative = this.refreshHook ? await this.refreshHook() : tournament;
    this.emitCheckpoint('refresh', authoritative, active, completed, failures);

    while (!this.abortController.signal.aborted && !this.dispatchStopped) {
      if (this.refreshHook) {
        authoritative = await this.refreshHook();
        this.emitCheckpoint('refresh', authoritative, active, completed, failures);
      }
      while (active.size < this.concurrency && !this.abortController.signal.aborted) {
        const pairing = this.selectNext(authoritative, active);
        if (!pairing) break;

        const claim = await this.claimPairing(pairing, failures);
        if (!claim) continue;

        this.emitCheckpoint('claim', authoritative, active, completed, failures, pairing.pairingId);

        this.claimed.add(pairing.pairingId);
        this.unsettled.set(pairing.pairingId, { pairingId: pairing.pairingId, claim });

        // Keep the authoritative snapshot immutable from the worker's point
        // of view. The worker receives only a local execution descriptor.
        const claimedPairing = claim.pairing ?? pairing;
        const claimedParticipants: [string, string] = [
          claimedPairing.participantA,
          claimedPairing.participantB as string,
        ];
        const executionPairing: TournamentPairing = {
          ...claimedPairing,
          status: 'in_progress',
          matchId: claimedPairing.matchId ?? pairing.matchId,
        };

        if (this.hasActiveParticipantConflict(claimedParticipants, active)) {
          this.rejectedClaims.add(pairing.pairingId);
          failures.push({
            pairingId: pairing.pairingId,
            error: new Error(`Durable claim ${pairing.pairingId} overlaps an active participant`),
          });
          try {
            await this.cleanupHook?.(executionPairing, claim);
          } catch (error) {
            failures.push({ pairingId: pairing.pairingId, error });
          }
          continue;
        }

        const worker: ActiveWorker<TResult> = {
          pairing: executionPairing,
          sourcePairing: pairing,
          claim,
          participants: claimedParticipants,
          promise: Promise.resolve(),
        };
        if (this.legacyLocalMutation) pairing.status = 'in_progress';
        worker.promise = this.executeWorker(worker, completed, failures).finally(() => {
          active.delete(pairing.pairingId);
        });
        active.set(pairing.pairingId, worker);
        this.emitCheckpoint('dispatch', authoritative, active, completed, failures, pairing.pairingId);
      }

      if (active.size === 0) {
        const blocked = this.getBlockedPairings(authoritative);
        if (blocked.length > 0) {
          const detail = blocked
            .slice(0, 8)
            .map(pairing => `${pairing.pairingId}:${pairing.status}:${pairing.participantA}vs${pairing.participantB ?? 'bye'}`)
            .join(', ');
          const error = new Error(`Scheduler made no progress; blocked pairings: ${detail}`);
          failures.push({ pairingId: blocked[0]!.pairingId, error });
          this.emitCheckpoint('no_progress', authoritative, active, completed, failures, blocked[0]!.pairingId, detail);
        }
        break;
      }
      await Promise.race(Array.from(active.values(), worker => worker.promise));
    }

    // Cancellation is intentionally a drain operation. The caller gets a
    // result only after every executor has observed cancellation and settled.
    await Promise.all(Array.from(active.values(), worker => worker.promise));
    this.emitCheckpoint('settled', authoritative, active, completed, failures);
    return {
      completed,
      failures,
      cancelled: this.abortController.signal.aborted,
      unsettledClaims: Array.from(this.unsettled.values()),
    };
  }

  private async claimPairing(
    pairing: TournamentPairing,
    failures: MatchSchedulerFailure[]
  ): Promise<MatchSchedulerClaim | null> {
    if (this.rejectedClaims.has(pairing.pairingId)) return null;

    try {
      const result = this.claimHook
        ? await this.claimHook(pairing, this.abortController.signal)
        : { pairing };
      if (result === false) {
        this.rejectedClaims.add(pairing.pairingId);
        return null;
      }
      if (this.abortController.signal.aborted) return null;
      if (result === true || result === undefined) return { pairing };
      return result;
    } catch (error) {
      this.rejectedClaims.add(pairing.pairingId);
      failures.push({ pairingId: pairing.pairingId, error });
      return null;
    }
  }

  private async executeWorker(
    worker: ActiveWorker<TResult>,
    completed: Array<{ pairingId: string; result: TResult }>,
    failures: MatchSchedulerFailure[]
  ): Promise<void> {
    try {
      const result = await this.executor.execute(worker.pairing, this.abortController.signal);
      if (this.abortController.signal.aborted) {
        if (this.legacyLocalMutation) worker.sourcePairing.status = 'cancelled';
        return;
      }

      await this.onComplete?.(worker.pairing, result);
      this.unsettled.delete(worker.pairing.pairingId);
      if (this.legacyLocalMutation) worker.sourcePairing.status = 'completed';
      if (this.refreshHook) await this.refreshHook();
      completed.push({ pairingId: worker.pairing.pairingId, result });
    } catch (error) {
      worker.error = error;
      if (this.legacyLocalMutation) worker.sourcePairing.status = this.abortController.signal.aborted ? 'cancelled' : 'failed';
      failures.push({ pairingId: worker.pairing.pairingId, error });
    } finally {
      try {
        await this.cleanupHook?.(worker.pairing, worker.claim);
      } catch (error) {
        failures.push({ pairingId: worker.pairing.pairingId, error });
      }
    }
  }

  private hasActiveParticipantConflict(
    participants: [string, string],
    active: Map<string, ActiveWorker<TResult>>
  ): boolean {
    const activeParticipants = new Set<string>();
    for (const worker of active.values()) {
      activeParticipants.add(worker.participants[0]);
      activeParticipants.add(worker.participants[1]);
    }
    return activeParticipants.has(participants[0]) || activeParticipants.has(participants[1]);
  }

  private selectNext(tournament: Tournament, active: Map<string, ActiveWorker<TResult>>): TournamentPairing | null {
    const candidates = getCurrentStagePairings(tournament);
    const activeParticipants = new Set<string>();
    for (const worker of active.values()) {
      activeParticipants.add(worker.participants[0]);
      activeParticipants.add(worker.participants[1]);
    }

    const openRounds = candidates
      .filter(pairing => pairing.status === 'in_progress' || (pairing.status === 'scheduled' && !this.claimed.has(pairing.pairingId)))
      .map(pairing => pairing.roundNumber);
    const barrierRound = openRounds.length > 0 ? Math.min(...openRounds) : null;
    if (barrierRound === null) return null;

    for (const pairing of candidates) {
      if (pairing.roundNumber !== barrierRound || !canPairingExecute(pairing)) continue;
      if (this.claimed.has(pairing.pairingId)) continue;
      if (this.rejectedClaims.has(pairing.pairingId)) continue;
      if (!dependenciesSettled(pairing, getAllTournamentPairings(tournament))) continue;

      const participants: [string, string] = [pairing.participantA, pairing.participantB as string];
      if (activeParticipants.has(participants[0]) || activeParticipants.has(participants[1])) continue;
      return pairing;
    }
    return null;
  }

  private getBlockedPairings(tournament: Tournament): TournamentPairing[] {
    return getCurrentStagePairings(tournament).filter(pairing =>
      pairing.participantB !== null &&
      pairing.status === 'scheduled' &&
      !this.claimed.has(pairing.pairingId) &&
      !this.rejectedClaims.has(pairing.pairingId)
    );
  }

  private emitCheckpoint(
    phase: MatchSchedulerCheckpoint['phase'],
    tournament: Tournament,
    active: Map<string, ActiveWorker<TResult>>,
    completed: Array<{ pairingId: string; result: TResult }>,
    failures: MatchSchedulerFailure[],
    pairingId?: string,
    detail?: string
  ): void {
    if (!this.checkpointHook) return;
    const currentStage = isMultiStageTournament(tournament) ? getCurrentStage(tournament) : undefined;
    const pendingPairingIds = getCurrentStagePairings(tournament)
      .filter(pairing => pairing.participantB !== null && pairing.status !== 'completed')
      .map(pairing => pairing.pairingId);
    this.checkpointHook({
      phase,
      ...(pairingId ? { pairingId } : {}),
      activePairingIds: Array.from(active.keys()),
      completedCount: completed.length,
      failureCount: failures.length,
      pendingPairingIds,
      ...(currentStage ? { currentStageId: currentStage.stageId } : {}),
      ...(detail ? { detail } : {}),
    });
  }

}

export async function runParallelMatchScheduler<TResult>(
  tournament: Tournament,
  executor: MatchSchedulerExecutor<TResult>,
  options: MatchSchedulerOptions<TResult> = {}
): Promise<MatchSchedulerResult<TResult>> {
  return new MatchScheduler(executor, options).run(tournament);
}

function getCurrentStagePairings(tournament: Tournament): TournamentPairing[] {
  if (!isMultiStageTournament(tournament)) return tournament.rounds.flatMap(round => round.pairings);

  const stage = getCurrentStage(tournament);
  return stage?.status === 'in_progress' ? getStagePairings(stage) : [];
}

/** Shared eligibility predicate for external fair dispatchers. */
export function isPairingDispatchEligible(tournament: Tournament, pairing: TournamentPairing): boolean {
  const candidates = getCurrentStagePairings(tournament);
  const openRounds = candidates
    .filter(candidate => candidate.status === 'in_progress' || candidate.status === 'scheduled')
    .map(candidate => candidate.roundNumber);
  const barrierRound = openRounds.length > 0 ? Math.min(...openRounds) : null;
  return barrierRound !== null &&
    pairing.roundNumber === barrierRound &&
    canPairingExecute(pairing) &&
    dependenciesSettled(pairing, getAllTournamentPairings(tournament));
}

function getStagePairings(stage: TournamentStage): TournamentPairing[] {
  const pairings: TournamentPairing[] = [];
  for (const round of stage.rounds ?? []) pairings.push(...round.pairings);
  for (const region of stage.regions ?? []) {
    for (const round of region.rounds) pairings.push(...round.pairings);
  }
  for (const group of stage.groups ?? []) {
    for (const round of group.rounds) pairings.push(...round.pairings);
  }
  return pairings;
}

function dependenciesSettled(pairing: TournamentPairing, allPairings: TournamentPairing[]): boolean {
  const dependencyIds = [pairing.slotA?.sourceRef?.pairingId, pairing.slotB?.sourceRef?.pairingId].filter(
    (id): id is string => Boolean(id)
  );
  return dependencyIds.every(dependencyId => allPairings.some(candidate => candidate.pairingId === dependencyId && candidate.status === 'completed'));
}
