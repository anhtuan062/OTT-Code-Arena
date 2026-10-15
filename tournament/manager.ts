/**
 * Tournament Manager - Application API
 *
 * High-level API for tournament lifecycle management.
 * Integrates scheduling, scoring, persistence, and match execution.
 */

import {
  Tournament,
  TournamentParticipant,
  TournamentBot,
  TournamentMatchConfig,
  TournamentScoringConfig,
  TournamentRound,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentSeriesGameRecord,
  TournamentSeriesProgress,
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
  PairingFailureCode,
  ParticipationRequest,
  TerminationReason,
  Player,
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
  VALID_STATUS_TRANSITIONS,
  MIN_PARTICIPANTS,
} from './types.js';

import {
  generateRoundRobinSchedule,
  validateRoundRobinSchedule,
  getNextEligiblePairing,
  getPendingPairings,
  isScheduleComplete,
  findPairing,
  markPairingInProgress,
  markPairingCompleted,
  generatePairingId,
} from './scheduling.js';

import {
  computeStandings,
  computeParticipantResults,
  analyzeMatchForParticipant,
  getTournamentStats,
} from './scoring.js';

import {
  TournamentRepository,
  FileTournamentRepository,
  createTournament,
  validateTournament,
  TournamentStorageConfig,
} from './persistence.js';

import {
  MatchExecutor,
  MockMatchExecutor,
  MatchRunnerExecutor,
  ExecutedMatchResult,
  createMatchRunnerExecutor,
} from './executor.js';

import type { MatchConfig, BotDefinition, LiveMatchSnapshot } from '@match-runner/types.js';
import { MatchReplay, MatchResult, MatchRunner } from '@match-runner/index.js';
import type { BotExecutor, SourceRevisionExecutor } from '@bot-executor/types.js';
import { isExecutionCancelledError } from '@bot-executor/types.js';
import type { SourceRevisionExecution } from '@match-runner/types.js';
import { createSeededInitialPieces } from '@engine/index.js';
import { createHash, randomUUID } from 'crypto';
import { gameWinnerForParticipants, getSeriesSides, seriesScore, seriesWinner } from './series.js';

const BO3_GAME_TRANSITION_DELAY_MS = 2500;

function createMatchId(tournamentId: string, pairingId: string): string {
  const candidate = `${tournamentId}-${pairingId}`;
  if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidate)) {
    return candidate;
  }

  // Preserve the historical readable ID when it is safe. Long participant
  // identifiers can otherwise exceed the repository's 128-character limit.
  return `m-${createHash('sha256').update(candidate).digest('hex')}`;
}

function classifyMatchExecutionFailure(error: unknown): { code: PairingFailureCode; reason: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/docker|container|runtime image|sandbox/i.test(message)) {
    return { code: 'DOCKER_INFRASTRUCTURE', reason: 'Docker execution infrastructure failed' };
  }
  if (/pinned source revision|source revision|integrity/i.test(message)) {
    return { code: 'SOURCE_REVISION', reason: 'Pinned source revision unavailable or failed integrity validation' };
  }
  return { code: 'EXECUTION', reason: 'Match execution failed' };
}

/**
 * Tournament application configuration
 */
export interface TournamentAppConfig {
  repository: TournamentRepository;
  executor: MatchExecutor;
  defaultMatchConfig?: Partial<TournamentMatchConfig>;
  defaultScoringConfig?: Partial<TournamentScoringConfig>;
  storageDir?: string;
  persistenceTimeoutMs?: number;
  validateSourceRevision?: (execution: SourceRevisionExecution) => Promise<boolean>;
  resolveSourceRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>;
  sourceRevisionExecutor?: SourceRevisionExecutor;
}

/**
 * Result of API operations
 */
export interface TournamentOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Main tournament application class
 */
export class TournamentManager {
  private repository: TournamentRepository;
  private executor: MatchExecutor;
  private defaultMatchConfig: TournamentMatchConfig;
  private defaultScoringConfig: TournamentScoringConfig;
  private readonly cancelledTournaments = new Set<string>();
  private readonly pendingResultWrites = new Map<string, Set<Promise<void>>>();
  private readonly terminalTransitionLocks = new Map<string, Promise<void>>();
  private readonly tournamentWriteLocks = new Map<string, Promise<void>>();
  private readonly tournamentMutationLocks = new Map<string, Promise<void>>();
  private readonly persistenceTimeoutMs: number;
  private readonly validateSourceRevision?: (execution: SourceRevisionExecution) => Promise<boolean>;
  private readonly resolveSourceRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>;
  private readonly sourceRevisionExecutor?: SourceRevisionExecutor;
  private readonly liveSnapshots = new Map<string, { tournamentId: string; snapshot: LiveMatchSnapshot; expiresAt: number }>();
  private readonly liveHistories = new Map<string, LiveMatchSnapshot[]>();
  private readonly liveSubscribers = new Map<string, Set<(snapshot: LiveMatchSnapshot) => void>>();

  constructor(config: TournamentAppConfig) {
    this.repository = config.repository;
    this.executor = config.executor;
    this.defaultMatchConfig = { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...config.defaultMatchConfig };
    this.defaultScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...config.defaultScoringConfig };
    this.persistenceTimeoutMs = config.persistenceTimeoutMs ?? 5000;
    this.validateSourceRevision = config.validateSourceRevision;
    this.resolveSourceRevision = config.resolveSourceRevision;
    this.sourceRevisionExecutor = config.sourceRevisionExecutor;
  }

  /** Release repository ownership after callers have stopped submitting work. */
  close(): void {
    this.liveSnapshots.clear();
    this.liveHistories.clear();
    this.liveSubscribers.clear();
    this.repository.close?.();
  }

  private liveKey(tournamentId: string, matchId: string): string {
    return `${tournamentId}:${matchId}`;
  }

  private compareLiveSnapshotOrder(left: LiveMatchSnapshot, right: LiveMatchSnapshot): number {
    const leftGame = left.gameNumber ?? 1;
    const rightGame = right.gameNumber ?? 1;
    if (leftGame !== rightGame) return leftGame - rightGame;
    return left.sequence - right.sequence;
  }

  private publishLiveSnapshot(tournamentId: string, snapshot: LiveMatchSnapshot): void {
    const now = Date.now();
    for (const [key, entry] of this.liveSnapshots) {
      if (entry.expiresAt <= now) this.liveSnapshots.delete(key);
    }
    const key = this.liveKey(tournamentId, snapshot.matchId);
    const previous = this.liveSnapshots.get(key);
    if (previous && this.compareLiveSnapshotOrder(snapshot, previous.snapshot) < 0) return;
    this.liveSnapshots.set(key, {
      tournamentId,
      snapshot,
      expiresAt: snapshot.status === 'in_progress' ? now + 5 * 60_000 : now + 60_000,
    });
    const history = this.liveHistories.get(key) ?? [];
    const duplicateIndex = history.findIndex(frame =>
      (frame.gameNumber ?? 1) === (snapshot.gameNumber ?? 1) && frame.sequence === snapshot.sequence
    );
    if (duplicateIndex >= 0) history[duplicateIndex] = snapshot;
    else history.push(snapshot);
    while (history.length > 512) history.shift();
    this.liveHistories.set(key, history);
    while (this.liveSnapshots.size > 64) {
      const oldest = [...this.liveSnapshots.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (!oldest) break;
      this.liveSnapshots.delete(oldest[0]);
    }
    for (const subscriber of this.liveSubscribers.get(key) ?? []) subscriber(snapshot);
  }

  subscribeLiveMatch(tournamentId: string, matchId: string, subscriber: (snapshot: LiveMatchSnapshot) => void): () => void {
    const key = this.liveKey(tournamentId, matchId);
    const subscribers = this.liveSubscribers.get(key) ?? new Set<(snapshot: LiveMatchSnapshot) => void>();
    subscribers.add(subscriber);
    this.liveSubscribers.set(key, subscribers);
    return () => {
      const current = this.liveSubscribers.get(key);
      if (!current) return;
      current.delete(subscriber);
      if (!current.size) this.liveSubscribers.delete(key);
    };
  }

  getLiveMatchSnapshot(tournamentId: string, matchId: string): LiveMatchSnapshot | null {
    const entry = this.liveSnapshots.get(this.liveKey(tournamentId, matchId));
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.liveSnapshots.delete(this.liveKey(tournamentId, matchId));
      return null;
    }
    return entry.snapshot;
  }

  getLiveMatchHistory(tournamentId: string, matchId: string): LiveMatchSnapshot[] {
    return [...(this.liveHistories.get(this.liveKey(tournamentId, matchId)) ?? [])];
  }

  private clearLiveMatch(tournamentId: string, matchId: string): void {
    const key = this.liveKey(tournamentId, matchId);
    this.liveSnapshots.delete(key);
    this.liveHistories.delete(key);
  }

  private async saveTournament(tournament: Tournament): Promise<void> {
    if (this.tournamentWriteLocks.has(tournament.tournamentId)) {
      throw new Error(`Tournament ${tournament.tournamentId} persistence is still in progress`);
    }
    const previous = this.tournamentWriteLocks.get(tournament.tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.tournamentWriteLocks.set(tournament.tournamentId, current);
    await previous;
    try {
      await this.repository.save(tournament);
    } finally {
      release();
      if (this.tournamentWriteLocks.get(tournament.tournamentId) === current) {
        this.tournamentWriteLocks.delete(tournament.tournamentId);
      }
    }
  }

  /** Serialize the complete load -> validate -> mutate -> save transaction. */
  private async mutateTournament<T>(
    tournamentId: string,
    operation: (tournament: Tournament) => Promise<TournamentOperationResult<T>> | TournamentOperationResult<T>
  ): Promise<TournamentOperationResult<T>> {
    const previous = this.tournamentMutationLocks.get(tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.tournamentMutationLocks.set(tournamentId, current);
    await previous;
    try {
      const tournament = await this.repository.load(tournamentId);
      if (!tournament) return { success: false, error: `Tournament ${tournamentId} not found` };
      return await operation(tournament);
    } finally {
      release();
      if (this.tournamentMutationLocks.get(tournamentId) === current) {
        this.tournamentMutationLocks.delete(tournamentId);
      }
    }
  }

  private async awaitPersistence<T>(operation: Promise<T>, label: string): Promise<T> {
    // This only bounds the caller. JavaScript promises and the repository
    // operation remain active after the timeout unless the repository itself
    // supports cancellation.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${this.persistenceTimeoutMs}ms`));
          }, this.persistenceTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Create a new tournament
   */
  async createTournament(
    tournamentId: string,
    name: string,
    format: TournamentFormat = 'single_round_robin',
    matchConfig?: Partial<TournamentMatchConfig>,
    scoringConfig?: Partial<TournamentScoringConfig>
  ): Promise<TournamentOperationResult<Tournament>> {
    // Check if tournament already exists
    if (await this.repository.exists(tournamentId)) {
      return { success: false, error: `Tournament ${tournamentId} already exists` };
    }

    const tournament = createTournament(
      tournamentId,
      name,
      format,
      matchConfig,
      scoringConfig
    );

    // Use provided configs or defaults
    if (matchConfig) {
      tournament.matchConfig = { ...this.defaultMatchConfig, ...matchConfig };
    } else {
      tournament.matchConfig = { ...this.defaultMatchConfig };
    }

    if (scoringConfig) {
      tournament.scoringConfig = { ...this.defaultScoringConfig, ...scoringConfig };
    } else {
      tournament.scoringConfig = { ...this.defaultScoringConfig };
    }

    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }

  /**
   * Load a tournament
   */
  async loadTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    const tournament = await this.repository.load(tournamentId);
    if (!tournament) {
      return { success: false, error: `Tournament ${tournamentId} not found` };
    }
    return { success: true, data: tournament };
  }

  /**
   * List all tournaments
   */
  async listTournaments(): Promise<Tournament[]> {
    return this.repository.list();
  }

  async updateMetadata(
    tournamentId: string,
    metadata: Record<string, unknown>
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      tournament.metadata = { ...(tournament.metadata ?? {}), ...metadata };
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  async updateTournamentDetails(
    tournamentId: string,
    name: string
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
        return { success: false, error: `Cannot edit: tournament status is ${tournament.status}` };
      }
      tournament.name = name;
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  async deleteTournament(tournamentId: string): Promise<TournamentOperationResult<null>> {
    return this.mutateTournament(tournamentId, async tournament => {
      await this.repository.delete(tournamentId);
      return { success: true, data: null };
    });
  }

  /**
   * Register a participant with their bot
   */
  async registerParticipant(
    tournamentId: string,
    participantId: string,
    name: string,
    bot: TournamentBot
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
        return { success: false, error: `Cannot register: tournament status is ${tournament.status}` };
      }
      if (tournament.participants.length >= 64) return { success: false, error: 'Maximum participants reached' };
      if (tournament.participants.some(p => p.participantId === participantId)) {
        return { success: false, error: `Participant ${participantId} already registered` };
      }
      if (!bot.command || !bot.botId) return { success: false, error: 'Bot must have botId and command' };
      tournament.participants.push({
        participantId,
        name,
        bot: { botId: bot.botId, player: 'A' as const, command: bot.command, args: bot.args || [], env: bot.env },
        registeredAt: new Date().toISOString(),
      });
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Unregister a participant
   */
  async unregisterParticipant(
    tournamentId: string,
    participantId: string
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
        return { success: false, error: `Cannot unregister: tournament status is ${tournament.status}` };
      }
      const index = tournament.participants.findIndex(p => p.participantId === participantId);
      if (index === -1) return { success: false, error: `Participant ${participantId} not found` };
      tournament.participants.splice(index, 1);
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Open registration
   */
  async openRegistration(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.transitionStatus(tournamentId, 'registration_open');
  }

  /** Close registration without starting execution. */
  async closeRegistration(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status === 'registration_closed') return { success: true, data: tournament };
      const validTransitions = VALID_STATUS_TRANSITIONS[tournament.status] || [];
      if (!validTransitions.includes('registration_closed')) {
        return { success: false, error: `Invalid status transition: ${tournament.status} -> registration_closed` };
      }
      if ((tournament.participationRequests ?? []).some(request => request.status === 'pending')) {
        return { success: false, error: 'Cannot close registration while participation requests are pending' };
      }
      tournament.status = 'registration_closed';
      tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Generate schedule (must be called after registration closes)
   */
  async generateSchedule(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') {
        return { success: false, error: `Cannot generate schedule: tournament status is ${tournament.status}` };
      }
      const pending = (tournament.participationRequests ?? []).filter(request => request.status === 'pending');
      if (pending.length) return { success: false, error: 'Cannot generate schedule while participation requests are pending' };
      const minParticipants = MIN_PARTICIPANTS[tournament.format] || 2;
      if (tournament.participants.length < minParticipants) {
        return { success: false, error: `Need at least ${minParticipants} participants for ${tournament.format}` };
      }
      const rounds = generateRoundRobinSchedule(tournament.participants);
      const validation = validateRoundRobinSchedule(tournament.participants, rounds);
      if (!validation.valid) return { success: false, error: `Schedule validation failed: ${validation.errors.join(', ')}` };
      for (const round of rounds) {
        for (const pairing of round.pairings) {
          pairing.pairingId = generatePairingId(pairing.participantA, pairing.participantB, round.roundNumber);
        }
      }
      tournament.rounds = rounds;
      tournament.status = 'registration_closed';
      tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
      tournament.standings = computeStandings(tournament.participants, [], tournament.scoringConfig);
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Start the tournament
   */
  async startTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'registration_closed' && !(tournament.status === 'registration_open' && tournament.rounds.length === 0)) {
        return { success: false, error: `Cannot start: tournament status is ${tournament.status}` };
      }
      if (tournament.rounds.length === 0) return { success: false, error: 'No schedule generated. Call generateSchedule first.' };
      tournament.status = 'running';
      tournament.startedAt = new Date().toISOString();
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  async submitParticipationRequest(
    tournamentId: string,
    request: Omit<ParticipationRequest, 'requestId' | 'status' | 'requestedAt' | 'reviewedAt' | 'reviewedBy' | 'rejectionReason'>
  ): Promise<TournamentOperationResult<ParticipationRequest>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'registration_open') return { success: false, error: `Cannot request participation: tournament status is ${tournament.status}` };
      const requests = tournament.participationRequests ?? (tournament.participationRequests = []);
      const duplicate = requests.find(existing => existing.competitorId === request.competitorId && existing.botId === request.botId && (existing.status === 'pending' || existing.status === 'approved'));
      if (duplicate) return { success: false, error: 'An active participation request already exists' };
      if (tournament.participants.length + requests.filter(item => item.status === 'pending' || item.status === 'approved').length >= 64) {
        return { success: false, error: 'Maximum participants reached' };
      }
      const created: ParticipationRequest = {
        ...request,
        requestId: `pr-${randomUUID()}`,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      };
      requests.push(created);
      await this.saveTournament(tournament);
      return { success: true, data: created };
    });
  }

  async listParticipationRequests(tournamentId: string): Promise<TournamentOperationResult<ParticipationRequest[]>> {
    const result = await this.loadTournament(tournamentId);
    if (!result.success || !result.data) return { success: false, error: result.error };
    return { success: true, data: [...(result.data.participationRequests ?? [])] };
  }

  async listMyParticipationRequests(tournamentId: string, competitorId: string): Promise<TournamentOperationResult<ParticipationRequest[]>> {
    const result = await this.listParticipationRequests(tournamentId);
    if (!result.success || !result.data) return result;
    return { success: true, data: result.data.filter(request => request.competitorId === competitorId) };
  }

  async reviewParticipationRequest(
    tournamentId: string,
    requestId: string,
    reviewerId: string,
    decision: 'approve' | 'reject',
    rejectionReason?: string
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') {
        return { success: false, error: `Cannot review participation requests while tournament status is ${tournament.status}` };
      }
      if (tournament.rounds.length > 0) return { success: false, error: 'Participation requests cannot be reviewed after scheduling' };
      const request = (tournament.participationRequests ?? []).find(item => item.requestId === requestId);
      if (!request) return { success: false, error: 'Participation request not found' };
      if (request.status !== 'pending') return { success: false, error: 'Participation request has already been reviewed' };
      if (decision === 'approve' && tournament.participants.some(participant => participant.bot.botId === request.botId)) {
        return { success: false, error: 'This Bot is already a tournament participant' };
      }
      const sourceExecution = request.botSnapshot.execution?.kind === 'source-revision' ? request.botSnapshot.execution : null;
      if (decision === 'approve' && sourceExecution) {
        if (sourceExecution.revisionId !== request.revisionId || sourceExecution.runtimeId !== request.runtimeId || sourceExecution.sourceDigest !== request.sourceDigest ||
            (sourceExecution.executionMode ?? 'raw') !== (request.executionMode ?? 'raw') ||
            sourceExecution.sdkVersion !== request.sdkVersion || sourceExecution.sdkDigest !== request.sdkDigest) {
          return { success: false, error: 'Participation request revision metadata is inconsistent' };
        }
        if (this.validateSourceRevision && !await this.validateSourceRevision(sourceExecution)) {
          return { success: false, error: 'Pinned source revision is unavailable or failed integrity validation' };
        }
      }
      const now = new Date().toISOString();
      request.reviewedAt = now;
      request.reviewedBy = reviewerId;
      if (decision === 'reject') {
        request.status = 'rejected';
        request.rejectionReason = rejectionReason?.trim() || null;
      } else {
        request.status = 'approved';
        tournament.participants.push({
          participantId: `p-${request.requestId}`,
          name: request.participantName,
          bot: { ...request.botSnapshot, player: 'A' },
          registeredAt: request.requestedAt,
        });
      }
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Run the next eligible match
   */
  async runNextMatch(tournamentId: string, signal?: AbortSignal): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'running') {
      return { success: false, error: `Tournament not running (status: ${tournament.status})` };
    }

    const pairing = getNextEligiblePairing(tournament.rounds);
    if (!pairing) {
      return { success: false, error: 'No pending matches to run' };
    }

    return this.runPairing(tournament, pairing, signal);
  }

  /**
   * Run all remaining matches sequentially
   */
  async runAllMatches(tournamentId: string, signal?: AbortSignal): Promise<TournamentOperationResult<ExecutedMatchResult[]>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'running') {
      return { success: false, error: `Tournament not running (status: ${tournament.status})` };
    }
    if (signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }

    await this.reconcileInterruptedPairings(tournament);

    // A new explicit run request is the retry boundary for failed attempts.
    // Do not retry them inside the same invocation, which could loop forever
    // on a persistent Docker or infrastructure failure.
    const failedPairings = tournament.rounds.flatMap(round => round.pairings)
      .filter(pairing => pairing.status === 'failed');
    if (failedPairings.length > 0) {
      for (const failedPairing of failedPairings) {
        failedPairing.status = 'scheduled';
        failedPairing.failureReason = null;
        failedPairing.failureCode = null;
      }
      await this.saveTournament(tournament);
    }

    const results: ExecutedMatchResult[] = [];
    const failures: string[] = [];
    let pairing = getNextEligiblePairing(tournament.rounds);

    while (pairing) {
      if (signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      const result = await this.runPairing(tournament, pairing, signal);
      if (result.success && result.data) {
        results.push(result.data);
        // Reload tournament to get updated state
        const reload = await this.loadTournament(tournamentId);
        if (!reload.success || !reload.data) {
          break;
        }
        tournament.rounds = reload.data.rounds;
        tournament.standings = reload.data.standings;
        if (signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
          return { success: false, error: 'Tournament execution cancelled' };
        }
        pairing = getNextEligiblePairing(tournament.rounds);
      } else {
        if (signal?.aborted || this.cancelledTournaments.has(tournamentId) || result.error === 'Tournament execution cancelled') {
          return { success: false, error: 'Tournament execution cancelled' };
        }
        failures.push(result.error ?? `Pairing ${pairing.pairingId} failed`);
        const reload = await this.loadTournament(tournamentId);
        if (!reload.success || !reload.data) {
          return { success: false, error: result.error };
        }
        tournament.rounds = reload.data.rounds;
        tournament.standings = reload.data.standings;
        pairing = getNextEligiblePairing(tournament.rounds);
      }
    }

    if (failures.length > 0) {
      return { success: false, error: `${failures.length} match(es) failed. Review the failed pairings and run execution again to retry.` };
    }

    // Check if tournament is complete
    if (!signal?.aborted && !this.cancelledTournaments.has(tournamentId) && isScheduleComplete(tournament.rounds)) {
      await this.completeTournament(tournamentId);
    }

    return { success: true, data: results };
  }

  /**
   * Run a specific pairing by ID
   */
  async runPairingById(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;
    const pairing = findPairing(tournament.rounds, pairingId);

    if (!pairing) {
      return { success: false, error: `Pairing ${pairingId} not found` };
    }

    if (pairing.status !== 'scheduled') {
      return { success: false, error: `Pairing not in scheduled state (current: ${pairing.status})` };
    }

    if (pairing.participantB === null) {
      return { success: false, error: 'Cannot run bye pairing' };
    }

    return this.runPairing(tournament, pairing);
  }

  /** Retry one failed pairing without changing the rest of the schedule. */
  async preparePairingRetry(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<null>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) return { success: false, error: loadResult.error };
    const tournament = loadResult.data;
    if (tournament.status !== 'running' && tournament.status !== 'completed') {
      return { success: false, error: `Tournament cannot be rerun (status: ${tournament.status})` };
    }
    const pairing = findPairing(tournament.rounds, pairingId);
    if (!pairing) return { success: false, error: `Pairing ${pairingId} not found` };
    if (pairing.status === 'completed') {
      return { success: false, error: 'Completed pairing rerun requires an explicit attempt policy' };
    }
    if (pairing.status !== 'failed') {
      return { success: false, error: `Pairing cannot be retried (current: ${pairing.status})` };
    }
    if (pairing.participantB === null) return { success: false, error: 'Cannot retry bye pairing' };

    // Retry is a new attempt: never reuse an old BO3 score, seed, replay, or
    // per-game checkpoint. Otherwise the viewer can reopen directly at game 3.
    const seriesMatchId = createMatchId(tournamentId, pairingId);
    await this.repository.deleteMatchResult(tournamentId, seriesMatchId);
    for (const gameNumber of [1, 2, 3] as const) {
      await this.repository.deleteMatchResult(tournamentId, createMatchId(tournamentId, `${pairingId}-g${gameNumber}`));
    }
    this.clearLiveMatch(tournamentId, seriesMatchId);
    pairing.status = 'scheduled';
    pairing.failureReason = null;
    pairing.failureCode = null;
    pairing.matchId = null;
    pairing.matchResult = null;
    pairing.startedAt = null;
    pairing.completedAt = null;
    pairing.seriesProgress = null;
    await this.saveTournament(tournament);
    return { success: true, data: null };
  }

  /** Retry one failed pairing without changing the rest of the schedule. */
  async retryPairingById(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    const prepared = await this.preparePairingRetry(tournamentId, pairingId);
    if (!prepared.success) return { success: false, error: prepared.error };
    const result = await this.runPairingById(tournamentId, pairingId);
    if (!result.success) return result;
    return result;
  }

  /**
   * Internal method to execute a pairing
   */
  private async runPairing(
    tournament: Tournament,
    pairing: TournamentPairing,
    signal?: AbortSignal
  ): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }
    const participantA = tournament.participants.find(p => p.participantId === pairing.participantA);
    const participantB = tournament.participants.find(p => p.participantId === pairing.participantB!);

    if (!participantA || !participantB) {
      return { success: false, error: 'Participant not found' };
    }

    if (tournament.matchConfig.bestOf === 3) {
      return this.runBestOfThreePairing(tournament, pairing, participantA, participantB, signal);
    }

    const matchId = createMatchId(tournament.tournamentId, pairing.pairingId);

    // Mark pairing as in progress
    if (!markPairingInProgress(tournament.rounds, pairing.pairingId, matchId)) {
      return { success: false, error: `Pairing ${pairing.pairingId} is not available` };
    }

    // Persist ownership of the pairing before starting any external work.
    // If this fails, no Docker execution may begin for an untracked match.
    try {
      await this.saveTournament(tournament);
    } catch (error) {
      return { success: false, error: `Unable to persist match start: ${error}` };
    }

    // Convert tournament bots to match runner bot definitions
    const botA: import('@match-runner/types.js').BotDefinition = {
      botId: participantA.bot.botId,
      player: 'A',
      command: participantA.bot.command,
      args: participantA.bot.args,
      env: participantA.bot.env,
      execution: participantA.bot.execution,
    };

    const botB: import('@match-runner/types.js').BotDefinition = {
      botId: participantB.bot.botId,
      player: 'B',
      command: participantB.bot.command,
      args: participantB.bot.args,
      env: participantB.bot.env,
      execution: participantB.bot.execution,
    };

    // Execute match
    let matchResult: MatchResult;
    try {
      const matchConfig: MatchConfig = {
        matchId,
        protocolVersion: tournament.matchConfig.protocolVersion,
        maxTurns: tournament.matchConfig.maxTurns,
        turnTimeoutMs: tournament.matchConfig.turnTimeoutMs,
        maxStdoutBytes: tournament.matchConfig.maxStdoutBytes,
        maxStderrBytes: tournament.matchConfig.maxStderrBytes,
        failurePolicy: tournament.matchConfig.failurePolicy,
        maxRetries: tournament.matchConfig.maxRetries,
        logRequests: tournament.matchConfig.logRequests,
        logResponses: tournament.matchConfig.logResponses,
        logStates: tournament.matchConfig.logStates,
      };
      matchResult = await this.executor.executeMatch(
        matchId,
        botA,
        botB,
        matchConfig,
        { onSnapshot: snapshot => this.publishLiveSnapshot(tournament.tournamentId, snapshot) },
        signal
      );
    } catch (error) {
      if (isExecutionCancelledError(error) || signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
        const live = this.getLiveMatchSnapshot(tournament.tournamentId, matchId);
        if (live) this.publishLiveSnapshot(tournament.tournamentId, { ...live, status: 'cancelled', sequence: live.sequence + 1, updatedAt: new Date().toISOString(), error: 'Tournament execution cancelled' });
        return { success: false, error: 'Tournament execution cancelled' };
      }
      // Persist an explicit retryable failure. A later explicit run request
      // resets failed pairings; this attempt never silently disappears.
      pairing.status = 'failed';
      const failure = classifyMatchExecutionFailure(error);
      pairing.failureCode = failure.code;
      pairing.failureReason = failure.reason;
      pairing.matchId = null;
      pairing.startedAt = null;
      const live = this.getLiveMatchSnapshot(tournament.tournamentId, matchId);
      if (live) this.publishLiveSnapshot(tournament.tournamentId, { ...live, status: 'failed', sequence: live.sequence + 1, updatedAt: new Date().toISOString(), error: failure.reason });
      await this.saveTournament(tournament);
      return { success: false, error: `Match execution failed: ${error}` };
    }

    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }

    // Create tournament match record
    const tournamentMatchRecord: TournamentMatchRecord = {
      matchId,
      pairingId: pairing.pairingId,
      participantA: pairing.participantA,
      participantB: pairing.participantB,
      winner: matchResult.winner,
      terminationReason: matchResult.terminationReason,
      turnCount: matchResult.turnCount,
      durationMs: matchResult.durationMs,
      replayRef: matchId, // Reference for loading replay
      completedAt: new Date().toISOString(),
      executionProvenance: (matchResult.metadata?.sourceRevisions as import('@match-runner/types.js').ExecutionProvenance[] | undefined),
      executionDiagnostics: matchResult.metadata?.executionDiagnostics,
    };

    // Create replay
    const replay = MatchRunner.createReplay(matchResult);

    // Save match result and replay
    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }
    const resultWrite = this.repository.saveMatchResult(
      tournament.tournamentId,
      matchId,
      tournamentMatchRecord,
      replay
    );
    const writes = this.pendingResultWrites.get(tournament.tournamentId) ?? new Set<Promise<void>>();
    writes.add(resultWrite);
    this.pendingResultWrites.set(tournament.tournamentId, writes);
    try {
      await resultWrite;
    } catch (error) {
      if (!this.cancelledTournaments.has(tournament.tournamentId)) {
        pairing.status = 'failed';
        pairing.failureReason = 'Match result persistence failed';
        pairing.failureCode = 'PERSISTENCE';
        pairing.matchId = null;
        pairing.startedAt = null;
        await this.saveTournament(tournament);
      }
      return { success: false, error: `Match result persistence failed: ${error}` };
    } finally {
      writes.delete(resultWrite);
      if (writes.size === 0) {
        this.pendingResultWrites.delete(tournament.tournamentId);
      }
    }

    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }

    // Mark pairing completed
    markPairingCompleted(tournament.rounds, pairing.pairingId, tournamentMatchRecord);

    // Recompute standings from all recorded results (idempotent)
    const allMatchRecords = await this.repository.listMatchResults(tournament.tournamentId);
    tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);

    // Save updated tournament
    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }
    await this.saveTournament(tournament);

    return {
      success: true,
      data: { matchResult, replay },
    };
  }

  /** Execute a pairing as a durable best-of-three series. */
  private async runBestOfThreePairing(
    tournament: Tournament,
    pairing: TournamentPairing,
    participantA: TournamentParticipant,
    participantB: TournamentParticipant,
    signal?: AbortSignal,
  ): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    const seriesMatchId = createMatchId(tournament.tournamentId, pairing.pairingId);
    const progress: TournamentSeriesProgress = pairing.seriesProgress ?? {
      format: 'bo3', bestOf: 3, seed: randomUUID(), nextGame: 1, winsA: 0, winsB: 0, games: [],
    };
    pairing.seriesProgress = progress;

    if (!markPairingInProgress(tournament.rounds, pairing.pairingId, seriesMatchId)) {
      return { success: false, error: `Pairing ${pairing.pairingId} is not available` };
    }
    try {
      await this.saveTournament(tournament);
    } catch (error) {
      return { success: false, error: `Unable to persist series start: ${error}` };
    }

    try {
      for (let gameNumber = progress.nextGame; gameNumber <= 3; gameNumber++) {
        if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
          return { success: false, error: 'Tournament execution cancelled' };
        }
        const numberedGame = gameNumber as 1 | 2 | 3;
        const gameId = createMatchId(tournament.tournamentId, `${pairing.pairingId}-g${numberedGame}`);
        const sides = getSeriesSides(progress.seed, numberedGame, participantA.participantId, participantB.participantId);
        let gameRecord = progress.games.find(game => game.gameNumber === numberedGame) ?? null;
        let matchResult: MatchResult;
        let replay: MatchReplay;

        const persistedGame = await this.repository.loadMatchResult(tournament.tournamentId, gameId);
        const persistedReplay = persistedGame ? await this.repository.loadReplay(tournament.tournamentId, gameId) : null;
        if (persistedGame?.seriesGameOf === seriesMatchId && persistedReplay) {
          matchResult = this.matchResultFromSeriesGame(persistedGame, persistedReplay, participantA, participantB);
          replay = persistedReplay;
          gameRecord ??= this.toSeriesGameRecord(persistedGame, numberedGame, sides);
        } else {
          const executed = await this.executeTournamentGame(tournament, seriesMatchId, gameId, numberedGame, progress.seed, sides, participantA, participantB, signal);
          matchResult = executed.matchResult;
          replay = executed.replay;
          if (matchResult.terminationReason === 'engine_error' || matchResult.terminationReason === 'unknown' || matchResult.winner === null) {
            throw new Error(`Series game ${numberedGame} ended without a countable result`);
          }
          gameRecord = this.toSeriesGameRecord({
            matchId: gameId,
            pairingId: pairing.pairingId,
            participantA: sides.playerA,
            participantB: sides.playerB,
            winner: matchResult.winner,
            terminationReason: matchResult.terminationReason,
            turnCount: matchResult.turnCount,
            durationMs: matchResult.durationMs,
            replayRef: gameId,
            completedAt: new Date().toISOString(),
          }, numberedGame, sides);
          await this.repository.saveMatchResult(tournament.tournamentId, gameId, {
            matchId: gameRecord.matchId,
            pairingId: pairing.pairingId,
            participantA: gameRecord.participantA,
            participantB: gameRecord.participantB,
            winner: gameRecord.winner,
            terminationReason: gameRecord.terminationReason,
            turnCount: gameRecord.turnCount,
            durationMs: gameRecord.durationMs,
            replayRef: gameRecord.replayRef,
            completedAt: gameRecord.completedAt,
            seriesGameOf: seriesMatchId,
          }, replay);
        }

        if (!gameRecord) throw new Error(`Series game ${numberedGame} could not be recorded`);
        progress.games = [...progress.games.filter(game => game.gameNumber !== numberedGame), gameRecord]
          .sort((left, right) => left.gameNumber - right.gameNumber);
        progress.winsA = progress.games.filter(game => game.winnerParticipantId === participantA.participantId).length;
        progress.winsB = progress.games.filter(game => game.winnerParticipantId === participantB.participantId).length;
        progress.nextGame = (numberedGame < 3 ? numberedGame + 1 : 3) as 1 | 2 | 3;
        pairing.seriesProgress = progress;
        await this.saveTournament(tournament);

        // The runner emits the finished-game snapshot before the durable
        // series progress is updated. Republish it after saving so spectators
        // receive the winner and the new score together instead of seeing a
        // stale 0-0 modal during the transition.
        const completedLive = this.getLiveMatchSnapshot(tournament.tournamentId, seriesMatchId);
        if (completedLive && completedLive.gameNumber === numberedGame) {
          this.publishLiveSnapshot(tournament.tournamentId, {
            ...completedLive,
            sequence: completedLive.sequence + 1,
            updatedAt: new Date().toISOString(),
          });
        }

        if (progress.winsA >= 2 || progress.winsB >= 2) break;

        // Give spectators a clear transition window and avoid starting the
        // next game immediately after the previous game's result is saved.
        if (numberedGame < 3) {
          await new Promise<void>(resolve => setTimeout(resolve, BO3_GAME_TRANSITION_DELAY_MS));
          if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
            return { success: false, error: 'Tournament execution cancelled' };
          }
        }
      }

      const games = progress.games;
      const score = seriesScore(games, participantA.participantId, participantB.participantId);
      const winner = seriesWinner(games, participantA.participantId, participantB.participantId);
      const replayGames = await Promise.all(games.map(async game => {
        const gameReplay = await this.repository.loadReplay(tournament.tournamentId, game.matchId);
        if (!gameReplay) throw new Error(`Series replay ${game.matchId} is missing`);
        return { game, replay: gameReplay };
      }));
      const firstReplay = replayGames[0]!.replay;
      const lastReplay = replayGames.at(-1)!.replay;
      const provenanceLists = replayGames.map(item => (item.replay.metadata?.sourceRevisions ?? [])
        .map(source => `${source.competitorId}:${source.botId}:${source.revisionId}:${source.sourceDigest}:${source.sdkDigest ?? ''}`)
        .sort().join('|'));
      if (provenanceLists.some(value => value !== provenanceLists[0])) {
        throw new Error('Series source revision provenance changed between games');
      }
      const provenance = [...new Map(replayGames.flatMap(item => item.replay.metadata?.sourceRevisions ?? []).map(item => [`${item.competitorId}:${item.botId}:${item.revisionId}`, item])).values()];
      const seriesReplay: MatchReplay = {
        ...firstReplay,
        matchId: seriesMatchId,
        initialState: firstReplay.initialState,
        moves: firstReplay.moves,
        finalState: lastReplay.finalState,
        winner,
        terminationReason: games.at(-1)?.terminationReason ?? null,
        metadata: { ...firstReplay.metadata, sourceRevisions: provenance },
        series: {
          format: 'bo3', bestOf: 3, seed: progress.seed, winsA: score.winsA, winsB: score.winsB, winner,
          games: replayGames.map(({ game, replay: gameReplay }) => ({
            gameNumber: game.gameNumber,
            participantA: game.participantA,
            participantB: game.participantB,
            winner: game.winner,
            winnerParticipantId: game.winnerParticipantId,
            replay: gameReplay,
          })),
        },
      };
      const aggregateRecord: TournamentMatchRecord = {
        matchId: seriesMatchId,
        pairingId: pairing.pairingId,
        participantA: participantA.participantId,
        participantB: participantB.participantId,
        winner,
        terminationReason: games.at(-1)?.terminationReason ?? null,
        turnCount: games.reduce((sum, game) => sum + game.turnCount, 0),
        durationMs: games.reduce((sum, game) => sum + game.durationMs, 0),
        replayRef: seriesMatchId,
        completedAt: new Date().toISOString(),
        executionProvenance: provenance,
        series: { format: 'bo3', bestOf: 3, seed: progress.seed, games, winsA: score.winsA, winsB: score.winsB, winner },
      };
      await this.repository.saveMatchResult(tournament.tournamentId, seriesMatchId, aggregateRecord, seriesReplay);
      markPairingCompleted(tournament.rounds, pairing.pairingId, aggregateRecord);
      const allMatchRecords = await this.repository.listMatchResults(tournament.tournamentId);
      tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);
      await this.saveTournament(tournament);

      const lastResult = lastReplay;
      return {
        success: true,
        data: {
          matchResult: {
            matchId: seriesMatchId,
            protocolVersion: lastResult.protocolVersion,
            status: 'finished', winner, terminationReason: aggregateRecord.terminationReason,
            turnCount: aggregateRecord.turnCount, startTime: firstReplay.metadata?.sourceRevisions ? new Date(0).toISOString() : new Date().toISOString(),
            endTime: aggregateRecord.completedAt, durationMs: aggregateRecord.durationMs,
            playerA: { ...participantA.bot, player: 'A' }, playerB: { ...participantB.bot, player: 'B' },
            initialState: firstReplay.initialState, finalState: lastResult.finalState, turnLog: [],
            metadata: { sourceRevisions: provenance },
          },
          replay: seriesReplay,
        },
      };
    } catch (error) {
      if (isExecutionCancelledError(error) || signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      pairing.status = 'failed';
      const failure = classifyMatchExecutionFailure(error);
      console.error(`[tournament] series execution failed for ${seriesMatchId}`, error);
      pairing.failureCode = failure.code;
      pairing.failureReason = failure.reason;
      pairing.matchId = null;
      pairing.startedAt = null;
      await this.saveTournament(tournament);
      return { success: false, error: `Series execution failed: ${error}` };
    }
  }

  private async executeTournamentGame(
    tournament: Tournament,
    seriesMatchId: string,
    gameId: string,
    gameNumber: 1 | 2 | 3,
    boardSeed: string,
    sides: { playerA: string; playerB: string },
    participantA: TournamentParticipant,
    participantB: TournamentParticipant,
    signal?: AbortSignal,
  ): Promise<ExecutedMatchResult> {
    const participantById = new Map([[participantA.participantId, participantA], [participantB.participantId, participantB]]);
    const sideA = participantById.get(sides.playerA)!;
    const sideB = participantById.get(sides.playerB)!;
    const botA: BotDefinition = { ...sideA.bot, player: 'A' };
    const botB: BotDefinition = { ...sideB.bot, player: 'B' };
    const matchConfig: MatchConfig = {
      matchId: gameId,
      protocolVersion: tournament.matchConfig.protocolVersion,
      maxTurns: tournament.matchConfig.maxTurns,
      turnTimeoutMs: tournament.matchConfig.turnTimeoutMs,
      maxStdoutBytes: tournament.matchConfig.maxStdoutBytes,
      maxStderrBytes: tournament.matchConfig.maxStderrBytes,
      failurePolicy: tournament.matchConfig.failurePolicy,
      maxRetries: tournament.matchConfig.maxRetries,
      logRequests: tournament.matchConfig.logRequests,
      logResponses: tournament.matchConfig.logResponses,
      logStates: tournament.matchConfig.logStates,
      initialPieces: createSeededInitialPieces(
        // BO3 progress.seed is persisted before game 1 starts and therefore
        // remains stable across retry and server recovery.
        boardSeed,
        gameNumber,
      ),
    };
    const result = await this.executor.executeMatch(
      gameId, botA, botB, matchConfig,
      { onSnapshot: snapshot => this.publishLiveSnapshot(tournament.tournamentId, { ...snapshot, matchId: seriesMatchId, gameNumber }) },
      signal,
    );
    return { matchResult: result, replay: MatchRunner.createReplay(result) };
  }

  private toSeriesGameRecord(result: Pick<TournamentMatchRecord, 'matchId' | 'pairingId' | 'participantA' | 'participantB' | 'winner' | 'terminationReason' | 'turnCount' | 'durationMs' | 'replayRef' | 'completedAt'>, gameNumber: 1 | 2 | 3, sides: { playerA: string; playerB: string }): TournamentSeriesGameRecord {
    return {
      gameNumber,
      matchId: result.matchId,
      participantA: sides.playerA,
      participantB: sides.playerB,
      winner: result.winner,
      winnerParticipantId: gameWinnerForParticipants(result.winner, sides.playerA, sides.playerB),
      terminationReason: result.terminationReason,
      turnCount: result.turnCount,
      durationMs: result.durationMs,
      replayRef: result.replayRef,
      completedAt: result.completedAt,
    };
  }

  private matchResultFromSeriesGame(record: TournamentMatchRecord, replay: MatchReplay, participantA: TournamentParticipant, participantB: TournamentParticipant): MatchResult {
    return {
      matchId: record.matchId, protocolVersion: replay.protocolVersion, status: 'finished', winner: record.winner,
      terminationReason: record.terminationReason, turnCount: record.turnCount, durationMs: record.durationMs,
      startTime: replay.metadata?.sourceRevisions ? new Date(0).toISOString() : record.completedAt,
      endTime: record.completedAt, playerA: { ...participantA.bot, player: 'A' }, playerB: { ...participantB.bot, player: 'B' },
      initialState: replay.initialState, finalState: replay.finalState, turnLog: [], metadata: replay.metadata,
    };
  }

  /**
   * Complete the tournament
   */
  async completeTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.withTerminalTransitionLock(tournamentId, async () => {
      if (this.cancelledTournaments.has(tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'running') {
      return { success: false, error: `Cannot complete: tournament status is ${tournament.status}` };
    }

    if (!isScheduleComplete(tournament.rounds)) {
      return { success: false, error: 'Not all matches completed' };
    }

    tournament.status = 'completed';
    tournament.completedAt = new Date().toISOString();
    if (this.cancelledTournaments.has(tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }
    await this.saveTournament(tournament);
    return { success: true, data: tournament };
    });
  }

  /**
   * Publish a completed tournament after re-validating its durable results.
   * Publication is a tournament mutation, so it shares the authoritative
   * load -> validate -> mutate -> save boundary with lifecycle changes.
   */
  async publishResults(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.resultsPublishedAt) return { success: true, data: tournament };
      if (tournament.status !== 'completed') {
        return { success: false, error: `Cannot publish results while tournament status is ${tournament.status}` };
      }
      if (!tournament.completedAt || !isScheduleComplete(tournament.rounds)) {
        return { success: false, error: 'Tournament results are incomplete' };
      }

      const expectedPairings = tournament.rounds.flatMap(round => round.pairings)
        .filter(pairing => pairing.participantB !== null);
      if (expectedPairings.some(pairing => pairing.status !== 'completed' || !pairing.matchId || !pairing.matchResult)) {
        return { success: false, error: 'Tournament results are incomplete' };
      }

      let records: TournamentMatchRecord[];
      try {
        records = await this.repository.listMatchResults(tournamentId);
        if (records.length !== expectedPairings.length) {
          return { success: false, error: 'Tournament results are incomplete or inconsistent' };
        }
        const recordsByMatchId = new Map(records.map(record => [record.matchId, record]));
        for (const pairing of expectedPairings) {
          const record = recordsByMatchId.get(pairing.matchId!);
          const pairingResult = pairing.matchResult!;
          if (!record || record.pairingId !== pairing.pairingId ||
              record.participantA !== pairing.participantA || record.participantB !== pairing.participantB ||
              record.matchId !== pairingResult.matchId || record.winner !== pairingResult.winner ||
              record.terminationReason !== pairingResult.terminationReason || record.turnCount !== pairingResult.turnCount ||
              record.durationMs !== pairingResult.durationMs || record.replayRef !== pairingResult.replayRef ||
              record.completedAt !== pairingResult.completedAt) {
            return { success: false, error: 'Tournament results are incomplete or inconsistent' };
          }
          const replay = await this.repository.loadReplay(tournamentId, pairing.matchId!);
          const seriesValid = record.series && replay?.series
            && replay.series.format === 'bo3'
            && replay.series.seed === record.series.seed
            && replay.series.winsA === record.series.winsA
            && replay.series.winsB === record.series.winsB
            && replay.series.winner === record.series.winner
            && replay.series.games.length === record.series.games.length
            && replay.series.games.every((game, index) => {
              const expected = record.series!.games[index];
              return expected && game.gameNumber === expected.gameNumber && game.participantA === expected.participantA &&
                game.participantB === expected.participantB && game.winner === expected.winner &&
                game.winnerParticipantId === expected.winnerParticipantId && game.replay.matchId === expected.matchId &&
                game.replay.winner === expected.winner &&
                (game.replay.finalState.winner === null || game.replay.finalState.winner === game.replay.winner);
            });
          // A Bot forfeit has an official match winner, but the engine state
          // may correctly retain winner=null because no legal move ended the
          // board game. BO1 uses the historical checks; BO3 additionally
          // validates every embedded game and its deterministic seed/score.
          const replayValid = replay && replay.matchId === pairing.matchId &&
            replay.winner === record.winner && replay.terminationReason === record.terminationReason &&
            (record.series ? Boolean(seriesValid) : (replay.finalState.winner === null || replay.finalState.winner === record.winner)) &&
            JSON.stringify(replay.metadata?.sourceRevisions ?? []) === JSON.stringify(record.executionProvenance ?? []);
          if (!replayValid) {
            return { success: false, error: 'Tournament replay integrity validation failed' };
          }
        }
      } catch (error) {
        return { success: false, error: `Tournament result integrity validation failed: ${error instanceof Error ? error.message : String(error)}` };
      }

      const expectedStandings = computeStandings(tournament.participants, records, tournament.scoringConfig);
      if (JSON.stringify(expectedStandings) !== JSON.stringify(tournament.standings)) {
        return { success: false, error: 'Tournament standings are inconsistent with persisted results' };
      }

      tournament.resultsPublishedAt = new Date().toISOString();
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Cancel the tournament
   */
  async cancelTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    this.cancelledTournaments.add(tournamentId);
    try {
      return await this.withTerminalTransitionLock(tournamentId, async () => {
        const writes = this.pendingResultWrites.get(tournamentId);
        if (writes) {
          const outcomes = await Promise.allSettled(
            [...writes].map(write => this.awaitPersistence(write, 'Match result persistence'))
          );
          if (outcomes.some(outcome =>
            outcome.status === 'rejected' &&
            outcome.reason instanceof Error &&
            outcome.reason.message.includes('timed out')
          )) {
            return {
              success: false,
              error: 'Tournament cancellation persistence is still in progress; retry cancellation',
            };
          }
        }
        return await this.awaitPersistence(
          this.transitionStatus(tournamentId, 'cancelled'),
          'Tournament cancellation'
        );
      });
    } catch (error) {
      return {
        success: false,
        error: `Tournament cancellation persistence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async withTerminalTransitionLock<T>(
    tournamentId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.terminalTransitionLocks.get(tournamentId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.terminalTransitionLocks.set(tournamentId, current);
    try {
      await this.awaitPersistence(previous, 'Terminal transition lock');
    } catch (error) {
      release();
      if (this.terminalTransitionLocks.get(tournamentId) === current) {
        this.terminalTransitionLocks.delete(tournamentId);
      }
      throw error;
    }
    try {
      return await operation();
    } finally {
      release();
      if (this.terminalTransitionLocks.get(tournamentId) === current) {
        this.terminalTransitionLocks.delete(tournamentId);
      }
    }
  }

  /**
   * Get current standings
   */
  async getStandings(tournamentId: string): Promise<TournamentOperationResult<TournamentStanding[]>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    return { success: true, data: loadResult.data.standings };
  }

  /**
   * Get match result by match ID
   */
  async getMatchResult(tournamentId: string, matchId: string): Promise<TournamentOperationResult<TournamentMatchRecord>> {
    const result = await this.repository.loadMatchResult(tournamentId, matchId);
    if (!result) {
      return { success: false, error: `Match ${matchId} not found` };
    }
    return { success: true, data: result };
  }

  /**
   * Get replay by match ID
   */
  async getReplay(tournamentId: string, matchId: string): Promise<TournamentOperationResult<MatchReplay>> {
    const replay = await this.repository.loadReplay(tournamentId, matchId);
    if (!replay) {
      return { success: false, error: `Replay for match ${matchId} not found` };
    }
    const tournamentResult = await this.loadTournament(tournamentId);
    const tournament = tournamentResult.success ? tournamentResult.data : null;
    const pairing = tournament?.rounds.flatMap(round => round.pairings).find(item => item.matchId === matchId);
    if (!tournament || !pairing) return { success: true, data: replay };
    const byId = new Map(tournament.participants.map(participant => [participant.participantId, participant]));
    const identity = (participantId: string | null) => {
      if (!participantId) return undefined;
      const participant = byId.get(participantId);
      if (!participant) return undefined;
      const execution = participant.bot.execution;
      return {
        participantId,
        participantName: participant.name,
        botId: participant.bot.botId,
        ...(execution?.kind === 'source-revision' ? { runtimeId: execution.runtimeId } : {}),
      };
    };
    return {
      success: true,
      data: {
        ...replay,
        participantIdentities: {
          A: identity(pairing.participantA),
          B: identity(pairing.participantB),
        },
        ...(replay.series ? {
          series: {
            ...replay.series,
            games: replay.series.games.map(game => ({
              ...game,
              replay: {
                ...game.replay,
                participantIdentities: {
                  A: identity(game.participantA),
                  B: identity(game.participantB),
                },
              },
            })),
          },
        } : {}),
      },
    };
  }

  /**
   * Get tournament statistics
   */
  async getStats(tournamentId: string): Promise<TournamentOperationResult<ReturnType<typeof getTournamentStats>>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;
    const matchRecords = await this.repository.listMatchResults(tournamentId);
     return { success: true, data: getTournamentStats(tournament.participants, matchRecords, tournament.rounds.flatMap(round => round.pairings)) };
  }

  /**
   * Transition tournament status with validation
   */
  private async transitionStatus(
    tournamentId: string,
    targetStatus: TournamentStatus,
    allowedFrom?: TournamentStatus
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      const currentStatus = tournament.status;
      const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
      const fromStatus = allowedFrom || currentStatus;
      if (!validTransitions.includes(targetStatus)) return { success: false, error: `Invalid status transition: ${fromStatus} -> ${targetStatus}` };
      if (targetStatus === 'registration_closed' && (tournament.participationRequests ?? []).some(request => request.status === 'pending')) {
        return { success: false, error: 'Cannot close registration while participation requests are pending' };
      }
      tournament.status = targetStatus;
      if (targetStatus === 'registration_open') tournament.registrationOpenedAt = new Date().toISOString();
      if (targetStatus === 'registration_closed') tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
      if (targetStatus === 'completed') tournament.completedAt = new Date().toISOString();
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Resume an interrupted tournament
   * Recomputes standings from stored match results
   */
  async resumeTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    // Load all match results and recompute standings (idempotent)
    const matchRecords = await this.repository.listMatchResults(tournamentId);
    tournament.standings = computeStandings(tournament.participants, matchRecords, tournament.scoringConfig);

    await this.reconcileInterruptedPairings(tournament, matchRecords);

    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }

  /**
   * Recover persisted running tournaments after a process restart. Completed
   * match artifacts remain authoritative; only in-progress pairings without a
   * committed result are made schedulable again.
   */
  async recoverInterruptedTournaments(): Promise<number> {
    const tournaments = await this.repository.list();
    let recovered = 0;
    for (const tournament of tournaments) {
      if (tournament.status !== 'running') continue;
      const hasInterruptedPairing = tournament.rounds.some(round =>
        round.pairings.some(pairing => pairing.status === 'in_progress'));
      if (!hasInterruptedPairing) continue;
      const matchRecords = await this.repository.listMatchResults(tournament.tournamentId);
      tournament.standings = computeStandings(tournament.participants, matchRecords, tournament.scoringConfig);
      await this.reconcileInterruptedPairings(tournament, matchRecords);
      await this.saveTournament(tournament);
      recovered += 1;
    }
    return recovered;
  }

  /**
   * Reconcile durable pairing state with committed match results.
   *
   * A committed result is authoritative. An in-progress pairing without a
   * committed result belongs to an execution interrupted after its start was
   * persisted, so it becomes eligible again after the previous writer has
   * released storage ownership.
   */
  private async reconcileInterruptedPairings(
    tournament: Tournament,
    matchRecords?: TournamentMatchRecord[]
  ): Promise<void> {
    const records = matchRecords ?? await this.repository.listMatchResults(tournament.tournamentId);
    const completedPairingIds = new Set(records.map(record => record.pairingId));

    for (const round of tournament.rounds) {
      for (const pairing of round.pairings) {
        if (pairing.status === 'in_progress' && !completedPairingIds.has(pairing.pairingId)) {
          pairing.status = 'scheduled';
          pairing.matchId = null;
          pairing.matchResult = null;
          pairing.startedAt = null;
          pairing.completedAt = null;
        }
      }
    }

    for (const record of records) {
      const pairing = findPairing(tournament.rounds, record.pairingId);
      if (pairing && pairing.status !== 'completed') {
        pairing.status = 'completed';
        pairing.matchId = record.matchId;
        pairing.matchResult = record;
        pairing.startedAt = record.completedAt;
        pairing.completedAt = record.completedAt;
      }
    }
  }
}

/**
 * Create a TournamentManager with file-based persistence
 */
export async function createTournamentManager(
  storageDir: string,
  executor?: MatchExecutor,
  executionPolicy?: 'development' | 'sandbox-required',
  executorConfig?: import('@bot-executor/index.js').ExecutorFactoryConfig,
  validateSourceRevision?: (execution: SourceRevisionExecution) => Promise<boolean>,
  resolveSourceRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>,
  sourceRevisionExecutor?: SourceRevisionExecutor
): Promise<TournamentManager> {
  const repository = new FileTournamentRepository({ baseDir: storageDir });
  await repository.initialize();

  try {
    const effectiveExecutionPolicy = executionPolicy ?? (
      process.env.NODE_ENV?.trim().toLowerCase() === 'production' ? 'sandbox-required' : 'development'
    );
    let matchExecutor = executor;
    if (!matchExecutor) {
      let botExecutor: BotExecutor | undefined;
      const { createExecutor } = await import('@bot-executor/index.js');
      const explicitTestExecutor = !executorConfig?.type &&
        !executorConfig?.dockerConfig &&
        !executorConfig?.childProcessConfig &&
        effectiveExecutionPolicy === 'development' &&
        process.env.NODE_ENV?.trim().toLowerCase() === 'test'
        ? 'child-process' as const
        : undefined;
      botExecutor = await createExecutor({
        ...executorConfig,
        ...(explicitTestExecutor ? { type: explicitTestExecutor } : {}),
        childProcessConfig: {
          ...executorConfig?.childProcessConfig,
          executionPolicy: effectiveExecutionPolicy,
        },
      });
      const { DEFAULT_MATCH_CONFIG } = await import('@match-runner/types.js');
      matchExecutor = await createMatchRunnerExecutor(DEFAULT_MATCH_CONFIG, botExecutor, sourceRevisionExecutor, resolveSourceRevision);
    }

    return new TournamentManager({ repository, executor: matchExecutor, storageDir, validateSourceRevision, resolveSourceRevision, sourceRevisionExecutor });
  } catch (error) {
    repository.close();
    throw error;
  }
}

/**
 * Create a TournamentManager with mock executor for testing
 */
export function createMockTournamentManager(
  repository: TournamentRepository
): TournamentManager {
  return new TournamentManager({
    repository,
    executor: new MockMatchExecutor(),
  });
}
