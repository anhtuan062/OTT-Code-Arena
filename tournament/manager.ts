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
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
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

import type { MatchConfig, BotDefinition } from '@match-runner/types.js';
import { MatchReplay, MatchResult, MatchRunner } from '@match-runner/index.js';
import type { BotExecutor } from '@bot-executor/types.js';
import { isExecutionCancelledError } from '@bot-executor/types.js';

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
  private readonly persistenceTimeoutMs: number;

  constructor(config: TournamentAppConfig) {
    this.repository = config.repository;
    this.executor = config.executor;
    this.defaultMatchConfig = { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...config.defaultMatchConfig };
    this.defaultScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...config.defaultScoringConfig };
    this.persistenceTimeoutMs = config.persistenceTimeoutMs ?? 5000;
  }

  /** Release repository ownership after callers have stopped submitting work. */
  close(): void {
    this.repository.close?.();
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
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) return loadResult;
    loadResult.data.metadata = { ...(loadResult.data.metadata ?? {}), ...metadata };
    await this.saveTournament(loadResult.data);
    return loadResult;
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
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    // Check status
    if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
      return { success: false, error: `Cannot register: tournament status is ${tournament.status}` };
    }

    // Check participant limit
    if (tournament.participants.length >= 64) {
      return { success: false, error: 'Maximum participants reached' };
    }

    // Check duplicate
    if (tournament.participants.some(p => p.participantId === participantId)) {
      return { success: false, error: `Participant ${participantId} already registered` };
    }

    // Validate bot
    if (!bot.command || !bot.botId) {
      return { success: false, error: 'Bot must have botId and command' };
    }

    const participant: TournamentParticipant = {
      participantId,
      name,
      bot: {
        botId: bot.botId,
        player: 'A' as const, // Will be assigned per match
        command: bot.command,
        args: bot.args || [],
        env: bot.env,
      },
      registeredAt: new Date().toISOString(),
    };

    tournament.participants.push(participant);
    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }

  /**
   * Unregister a participant
   */
  async unregisterParticipant(
    tournamentId: string,
    participantId: string
  ): Promise<TournamentOperationResult<Tournament>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
      return { success: false, error: `Cannot unregister: tournament status is ${tournament.status}` };
    }

    const index = tournament.participants.findIndex(p => p.participantId === participantId);
    if (index === -1) {
      return { success: false, error: `Participant ${participantId} not found` };
    }

    tournament.participants.splice(index, 1);
    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }

  /**
   * Open registration
   */
  async openRegistration(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.transitionStatus(tournamentId, 'registration_open');
  }

  /**
   * Close registration. Kept as a compatibility alias for starting a
   * scheduled tournament so every transition to running shares the same
   * schedule validation and startedAt assignment.
   */
  async closeRegistration(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.startTournament(tournamentId);
  }

  /**
   * Generate schedule (must be called after registration closes)
   */
  async generateSchedule(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'registration_open') {
      return { success: false, error: `Cannot generate schedule: tournament status is ${tournament.status}` };
    }

    const minParticipants = MIN_PARTICIPANTS[tournament.format] || 2;
    if (tournament.participants.length < minParticipants) {
      return { success: false, error: `Need at least ${minParticipants} participants for ${tournament.format}` };
    }

    // Generate round-robin schedule
    const rounds = generateRoundRobinSchedule(tournament.participants);

    // Validate schedule
    const validation = validateRoundRobinSchedule(tournament.participants, rounds);
    if (!validation.valid) {
      return { success: false, error: `Schedule validation failed: ${validation.errors.join(', ')}` };
    }

    // Update pairings with deterministic IDs
    for (const round of rounds) {
      for (const pairing of round.pairings) {
        pairing.pairingId = generatePairingId(pairing.participantA, pairing.participantB, round.roundNumber);
      }
    }

    tournament.rounds = rounds;
    tournament.registrationClosedAt = new Date().toISOString();

    // Initialize standings
    tournament.standings = computeStandings(tournament.participants, [], tournament.scoringConfig);

    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }

  /**
   * Start the tournament
   */
  async startTournament(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'registration_open') {
      return { success: false, error: `Cannot start: tournament status is ${tournament.status}` };
    }

    if (tournament.rounds.length === 0) {
      return { success: false, error: 'No schedule generated. Call generateSchedule first.' };
    }

    tournament.status = 'running';
    tournament.startedAt = new Date().toISOString();
    await this.saveTournament(tournament);
    return { success: true, data: tournament };
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

    const results: ExecutedMatchResult[] = [];
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
        return { success: false, error: result.error };
      }
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

    const matchId = `${tournament.tournamentId}-${pairing.pairingId}`;

    // Mark pairing as in progress
    markPairingInProgress(tournament.rounds, pairing.pairingId, matchId);

    // Convert tournament bots to match runner bot definitions
    const botA: import('@match-runner/types.js').BotDefinition = {
      botId: participantA.bot.botId,
      player: 'A',
      command: participantA.bot.command,
      args: participantA.bot.args,
      env: participantA.bot.env,
    };

    const botB: import('@match-runner/types.js').BotDefinition = {
      botId: participantB.bot.botId,
      player: 'B',
      command: participantB.bot.command,
      args: participantB.bot.args,
      env: participantB.bot.env,
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
        undefined,
        signal
      );
    } catch (error) {
      if (isExecutionCancelledError(error) || signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      // On executor failure, mark pairing as failed but don't complete it
      pairing.status = 'scheduled'; // Reset to allow retry
      pairing.matchId = null;
      pairing.startedAt = null;
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
        pairing.status = 'scheduled';
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
    return { success: true, data: replay };
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
    return { success: true, data: getTournamentStats(tournament.participants, matchRecords) };
  }

  /**
   * Transition tournament status with validation
   */
  private async transitionStatus(
    tournamentId: string,
    targetStatus: TournamentStatus,
    allowedFrom?: TournamentStatus
  ): Promise<TournamentOperationResult<Tournament>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;
    const currentStatus = tournament.status;

    // Check if transition is valid
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    const fromStatus = allowedFrom || currentStatus;
    if (!validTransitions.includes(targetStatus)) {
      return { success: false, error: `Invalid status transition: ${fromStatus} -> ${targetStatus}` };
    }

    tournament.status = targetStatus;

    if (targetStatus === 'registration_open') {
      tournament.registrationOpenedAt = new Date().toISOString();
    } else if (targetStatus === 'completed') {
      tournament.completedAt = new Date().toISOString();
    } else if (targetStatus === 'cancelled') {
      // No additional timestamp needed
    }

    await this.saveTournament(tournament);
    return { success: true, data: tournament };
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

    // Update pairing statuses from match records
    for (const record of matchRecords) {
      const pairing = findPairing(tournament.rounds, record.pairingId);
      if (pairing && pairing.status !== 'completed') {
        pairing.status = 'completed';
        pairing.matchId = record.matchId;
        pairing.matchResult = record;
        pairing.startedAt = record.completedAt; // Approximate
        pairing.completedAt = record.completedAt;
      }
    }

    await this.saveTournament(tournament);
    return { success: true, data: tournament };
  }
}

/**
 * Create a TournamentManager with file-based persistence
 */
export async function createTournamentManager(
  storageDir: string,
  executor?: MatchExecutor,
  executionPolicy?: 'development' | 'sandbox-required',
  executorConfig?: import('@bot-executor/index.js').ExecutorFactoryConfig
): Promise<TournamentManager> {
  const repository = new FileTournamentRepository({ baseDir: storageDir });
  await repository.initialize();

  try {
    let matchExecutor = executor;
    if (!matchExecutor) {
      let botExecutor: BotExecutor | undefined;
      try {
        const { createExecutor } = await import('@bot-executor/index.js');
        botExecutor = await createExecutor({
          ...executorConfig,
          childProcessConfig: { executionPolicy: executionPolicy ?? 'development' }
        });
      } catch (error) {
        // If sandbox-required but Docker unavailable, throw
        if (executionPolicy === 'sandbox-required') {
          throw new Error(`Failed to create sandbox executor: ${error}`);
        }
        // In development mode, fall back to BotRunnerAdapter (handled by MatchRunner)
      }
      const { DEFAULT_MATCH_CONFIG } = await import('@match-runner/types.js');
      matchExecutor = await createMatchRunnerExecutor(DEFAULT_MATCH_CONFIG, botExecutor);
    }

    return new TournamentManager({ repository, executor: matchExecutor, storageDir });
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
