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
  NEW_TOURNAMENT_TURN_TIMEOUT_MS,
  NEW_TOURNAMENT_BEST_OF,
  NEW_TOURNAMENT_FORMAT,
  DEFAULT_SCORING_CONFIG,
  NEW_TOURNAMENT_SCORING_CONFIG,
  DEFAULT_TOURNAMENT_SCHEDULE,
  DEFAULT_TOURNAMENT_RULES,
  DEFAULT_TOURNAMENT_BOT_LIMITS,
  VALID_STATUS_TRANSITIONS,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MAX_PARTICIPANTS_BY_FORMAT,
  getMaxParticipants,
  TournamentUpdateDetails,
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
import {
  isMultiStageTournament,
  createMultiStageTournament,
  activateNextStage,
  commitMatchResultAndResolveSlots,
  canPairingExecute,
  getCurrentStage,
  getExecutablePairings,
  isTournamentComplete,
  getAllTournamentPairings,
  findPairingInTournament,
  isSlotPlaceholder,
} from './multi-stage.js';
import { MatchScheduler } from './match-scheduler.js';
import type { MatchSchedulerCheckpoint } from './match-scheduler.js';
import { isPairingDispatchEligible } from './match-scheduler.js';
import { TournamentCommitCoordinator } from './commit-coordinator.js';
import type { MatchJobClaim, MatchJobStore } from './match-job-store.js';
import { FairMatchDispatcher } from './fair-match-dispatcher.js';
import type { FairMatchQuantum } from './fair-match-dispatcher.js';

const BO3_GAME_TRANSITION_DELAY_MS = 2500;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function createRulesetSnapshot(tournament: Tournament, createdAt: string) {
  const payload = {
    rulesetId: tournament.rulesConfig?.rulesetId ?? DEFAULT_TOURNAMENT_RULES.rulesetId,
    rulesetVersion: tournament.rulesConfig?.rulesetVersion ?? DEFAULT_TOURNAMENT_RULES.rulesetVersion,
    format: tournament.format,
    matchConfig: { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...(tournament.matchConfig ?? {}) },
    scoringConfig: { ...DEFAULT_SCORING_CONFIG, ...(tournament.scoringConfig ?? {}) },
    botLimits: { ...DEFAULT_TOURNAMENT_BOT_LIMITS, ...(tournament.botLimits ?? {}) },
    ruleModifiers: { conversion: Boolean(tournament.rulesConfig?.ruleModifiers?.conversion) },
  } as const;
  return {
    ...payload,
    createdAt,
    snapshotHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

function executionConfiguration(tournament: Tournament): {
  matchConfig: TournamentMatchConfig;
  botLimits: typeof DEFAULT_TOURNAMENT_BOT_LIMITS;
  ruleModifiers: { conversion: boolean };
} {
  const snapshot = tournament.rulesetSnapshot;
  return {
    matchConfig: { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...(snapshot?.matchConfig ?? tournament.matchConfig ?? {}) },
    botLimits: { ...DEFAULT_TOURNAMENT_BOT_LIMITS, ...(snapshot?.botLimits ?? tournament.botLimits ?? {}) },
    ruleModifiers: { conversion: Boolean(snapshot?.ruleModifiers?.conversion ?? tournament.rulesConfig?.ruleModifiers?.conversion) },
  };
}

function maxBotsPerCompetitor(tournament: Tournament, botLimits: typeof DEFAULT_TOURNAMENT_BOT_LIMITS): number {
  // Legacy records predate this policy and must retain their historical
  // ability to submit multiple Bots per competitor.
  if (tournament.configurationVersion !== 2) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.floor(botLimits.maxBotsPerCompetitor ?? 1));
}

function applyScheduledLifecycle(tournament: Tournament, now: Date): { opened: boolean; closed: boolean } {
  const schedule = tournament.schedule ?? DEFAULT_TOURNAMENT_SCHEDULE;
  const nowMs = now.getTime();
  let opened = false;
  let closed = false;

  if (tournament.status === 'draft' && schedule.registrationOpensAt) {
    const opensAt = Date.parse(schedule.registrationOpensAt);
    if (Number.isFinite(opensAt) && opensAt <= nowMs) {
      const openedAt = now.toISOString();
      tournament.status = 'registration_open';
      tournament.registrationOpenedAt = tournament.registrationOpenedAt ?? openedAt;
      tournament.schedule = {
        ...DEFAULT_TOURNAMENT_SCHEDULE,
        ...schedule,
        registrationOpensAt: schedule.registrationOpensAt ?? openedAt,
      };
      tournament.rulesetSnapshot = tournament.rulesetSnapshot ?? createRulesetSnapshot(tournament, openedAt);
      opened = true;
    }
  }

  if (tournament.status === 'registration_open' && schedule.registrationClosesAt) {
    const closesAt = Date.parse(schedule.registrationClosesAt);
    if (Number.isFinite(closesAt) && closesAt <= nowMs) {
      tournament.status = 'registration_closed';
      tournament.registrationClosedAt = tournament.registrationClosedAt ?? now.toISOString();
      tournament.registrationClosedReason = 'scheduled';
      closed = true;
    }
  }

  return { opened, closed };
}

function validateTournamentSettingsUpdate(
  tournament: Tournament,
  update: TournamentUpdateDetails,
): { valid: true } | { valid: false; error: string } {
  const settingsChanged = Boolean(update.format || update.matchConfig || update.scoringConfig || update.rulesConfig || update.botLimits);
  if (tournament.configurationVersion === 2) {
    if (update.format !== undefined && update.format !== NEW_TOURNAMENT_FORMAT) {
      return { valid: false, error: 'New tournaments use the multi_stage format' };
    }
    if (update.matchConfig && Object.prototype.hasOwnProperty.call(update.matchConfig, 'bestOf')) {
      return { valid: false, error: 'New tournaments use stage-specific series: Group Stage BO2 and Knockout BO3' };
    }
    if (update.scoringConfig && Object.keys(update.scoringConfig).some(key => ['winPoints', 'drawPoints', 'lossPoints', 'byePoints'].includes(key))) {
      return { valid: false, error: 'New tournaments use fixed scoring: win 3, draw 1, loss 0' };
    }
    if (update.botLimits && Object.keys(update.botLimits).length > 0) {
      return { valid: false, error: 'New tournament Bot limits are managed by the platform and cannot be edited' };
    }
    if (update.matchConfig && Object.keys(update.matchConfig).some(key => !['maxTurns', 'turnTimeoutMs'].includes(key))) {
      return { valid: false, error: 'New tournaments only allow maxTurns and turnTimeoutMs to be edited' };
    }
  }
  const locked = tournament.status !== 'draft' || Boolean(tournament.rulesetSnapshot);
  if (settingsChanged && locked) {
    return { valid: false, error: 'Tournament format, rules, scoring and technical limits are locked after registration opens' };
  }

  if (update.format && update.format !== 'single_round_robin' && update.format !== 'multi_stage') {
    return { valid: false, error: 'Invalid tournament format' };
  }
  if (update.rulesConfig && Object.keys(update.rulesConfig).some(key => !['rulesetId', 'rulesetVersion', 'ruleModifiers'].includes(key))) return { valid: false, error: 'Unsupported rulesConfig option' };
  if (update.rulesConfig && (update.rulesConfig.rulesetId !== undefined && update.rulesConfig.rulesetId !== 'ott-standard' || update.rulesConfig.rulesetVersion !== undefined && update.rulesConfig.rulesetVersion !== 1)) {
    return { valid: false, error: 'Unsupported tournament ruleset' };
  }
  if (update.rulesConfig?.ruleModifiers) {
    const modifiers = update.rulesConfig.ruleModifiers;
    if (Object.keys(modifiers).some(key => key !== 'conversion')) return { valid: false, error: 'Unsupported rule modifier' };
    if (modifiers.conversion !== undefined && typeof modifiers.conversion !== 'boolean') return { valid: false, error: 'conversion modifier must be boolean' };
  }

  const match = update.matchConfig;
  if (match) {
    if (Object.keys(match).some(key => !['protocolVersion', 'maxTurns', 'turnTimeoutMs', 'maxStdoutBytes', 'maxStderrBytes', 'failurePolicy', 'maxRetries', 'logRequests', 'logResponses', 'logStates', 'bestOf'].includes(key))) return { valid: false, error: 'Unsupported matchConfig option' };
    if (match.protocolVersion !== undefined && match.protocolVersion !== '0.1.0') return { valid: false, error: 'Unsupported protocol version' };
    if (match.failurePolicy !== undefined && match.failurePolicy !== 'forfeit') return { valid: false, error: 'Unsupported failure policy' };
    if (match.bestOf !== undefined && ![1, 2, 3].includes(match.bestOf)) return { valid: false, error: 'bestOf must be 1, 2 or 3' };
    const positive = ['maxTurns', 'turnTimeoutMs', 'maxStdoutBytes', 'maxStderrBytes', 'maxRetries'] as const;
    for (const key of positive) if (match[key] !== undefined && (!Number.isInteger(match[key]) || match[key] < 0)) return { valid: false, error: `Invalid matchConfig.${key}` };
    if (tournament.configurationVersion === 2 && match.turnTimeoutMs !== undefined && match.turnTimeoutMs < NEW_TOURNAMENT_TURN_TIMEOUT_MS) {
      return { valid: false, error: `New tournament turnTimeoutMs must be at least ${NEW_TOURNAMENT_TURN_TIMEOUT_MS}ms` };
    }
    if (match.maxTurns !== undefined && match.maxTurns > 10000 || match.turnTimeoutMs !== undefined && match.turnTimeoutMs > 120000) return { valid: false, error: 'Match technical limit is outside the supported range' };
  }
  const score = update.scoringConfig;
  if (score && Object.values(score).some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))) {
    return { valid: false, error: 'Scoring values must be non-negative numbers' };
  }
  if (score && Object.keys(score).some(key => !['winPoints', 'drawPoints', 'lossPoints', 'byePoints'].includes(key))) return { valid: false, error: 'Unsupported scoringConfig option' };
  const limits = update.botLimits;
  if (limits) {
    if (Object.keys(limits).some(key => !['maxSourceBytes', 'memoryLimitMb', 'cpuLimit', 'maxProcesses', 'maxBotsPerCompetitor'].includes(key))) return { valid: false, error: 'Unsupported botLimits option' };
    if (limits.maxSourceBytes !== undefined && (!Number.isInteger(limits.maxSourceBytes) || limits.maxSourceBytes < 1 || limits.maxSourceBytes > DEFAULT_TOURNAMENT_BOT_LIMITS.maxSourceBytes)) return { valid: false, error: 'maxSourceBytes exceeds the engine limit' };
    if (limits.memoryLimitMb !== undefined && (!Number.isInteger(limits.memoryLimitMb) || limits.memoryLimitMb < 64 || limits.memoryLimitMb > DEFAULT_TOURNAMENT_BOT_LIMITS.memoryLimitMb)) return { valid: false, error: 'memoryLimitMb is outside the supported range' };
    if (limits.cpuLimit !== undefined && (!Number.isFinite(limits.cpuLimit) || limits.cpuLimit <= 0 || limits.cpuLimit > DEFAULT_TOURNAMENT_BOT_LIMITS.cpuLimit)) return { valid: false, error: 'cpuLimit is outside the supported range' };
    if (limits.maxProcesses !== undefined && (!Number.isInteger(limits.maxProcesses) || limits.maxProcesses < 1 || limits.maxProcesses > DEFAULT_TOURNAMENT_BOT_LIMITS.maxProcesses)) return { valid: false, error: 'maxProcesses is outside the supported range' };
    if (limits.maxBotsPerCompetitor !== undefined && (!Number.isInteger(limits.maxBotsPerCompetitor) || limits.maxBotsPerCompetitor < 1 || limits.maxBotsPerCompetitor > 64)) return { valid: false, error: 'maxBotsPerCompetitor is outside the supported range' };
  }

  if (update.schedule) {
    if (Object.keys(update.schedule).some(key => !['visibleAt', 'registrationOpensAt', 'registrationClosesAt'].includes(key))) return { valid: false, error: 'Unsupported schedule option' };
    const current = tournament.schedule ?? DEFAULT_TOURNAMENT_SCHEDULE;
    const next = { ...current, ...update.schedule };
    for (const key of ['visibleAt', 'registrationOpensAt', 'registrationClosesAt'] as const) {
      if (next[key] !== null && !isIsoDate(next[key])) return { valid: false, error: `Invalid schedule.${key}` };
    }
    if (next.registrationOpensAt && next.registrationClosesAt && Date.parse(next.registrationOpensAt) >= Date.parse(next.registrationClosesAt)) return { valid: false, error: 'Registration opening must be before closing' };
    if (next.visibleAt && next.registrationOpensAt && Date.parse(next.visibleAt) > Date.parse(next.registrationOpensAt)) return { valid: false, error: 'Visibility must not start after registration opening' };
    if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
      return { valid: false, error: 'Tournament schedule is locked after registration closes' };
    }
    if (tournament.status === 'registration_open') {
      const onlyExtension = Object.keys(update.schedule).every(key => key === 'registrationClosesAt');
      const currentClose = current.registrationClosesAt ? Date.parse(current.registrationClosesAt) : null;
      const nextClose = next.registrationClosesAt ? Date.parse(next.registrationClosesAt) : null;
      if (!onlyExtension || !nextClose || (currentClose !== null && nextClose <= currentClose) || nextClose <= Date.now()) return { valid: false, error: 'Only a valid registration deadline extension is allowed while registration is open' };
    }
  }
  return { valid: true };
}

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
  if (/saveMatchResult|persistence/i.test(message)) {
    return { code: 'PERSISTENCE', reason: 'Match result persistence failed' };
  }
  if (/docker|container|runtime image|sandbox/i.test(message)) {
    return { code: 'DOCKER_INFRASTRUCTURE', reason: 'Docker execution infrastructure failed' };
  }
  if (/pinned source revision|source revision|integrity/i.test(message)) {
    return { code: 'SOURCE_REVISION', reason: 'Pinned source revision unavailable or failed integrity validation' };
  }
  if (/timed?\s*out|timeout|time limit/i.test(message)) {
    return { code: 'TIMEOUT', reason: 'Match execution timed out' };
  }
  return { code: 'EXECUTION', reason: 'Match execution failed' };
}

type SchedulerCompletedData = ExecutedMatchResult & {
  /** BO1 commits are completed by the scheduler callback; series commits are already durable. */
  tournamentMatchRecord?: TournamentMatchRecord;
  committed?: boolean;
};

type SchedulerExecution =
  | { kind: 'completed'; data: SchedulerCompletedData }
  | { kind: 'failed'; error: unknown };

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
  validateTournamentRevisions?: (executions: SourceRevisionExecution[]) => Promise<{ valid: boolean; pending: boolean; error?: string }>;
  resolveSourceRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>;
  sourceRevisionExecutor?: SourceRevisionExecutor;
  enableMultiStage?: boolean;
  concurrencyLimit?: number;
  /** Opt-in BO1 scheduler path. It defaults to one worker. */
  enableBo1MatchScheduler?: boolean;
  /** QA-only scheduler override. Omitted in production; accepted value is 2. */
  qaMaxActiveMatches?: 2;
  /** Explicit series scheduler concurrency. Defaults to one active pairing. */
  seriesMatchConcurrency?: 1 | 2;
  /** Required safety gate when seriesMatchConcurrency is 2. */
  enableSeriesConcurrency2?: boolean;
  matchJobStore?: MatchJobStore;
  matchJobWorkerId?: string;
  matchJobLeaseMs?: number;
  /** Optional diagnostics for the opt-in BO1 scheduler path. */
  onBo1SchedulerCheckpoint?: (checkpoint: MatchSchedulerCheckpoint) => void;
}

export interface SeriesSchedulerRuntimeConfig {
  enabled: boolean;
  concurrency: 1 | 2;
  concurrency2Enabled: boolean;
}

/**
 * Resolve the production opt-in from environment configuration.
 * A value of 2 is rejected unless both scheduler opt-ins are explicit.
 * Configuration is read when the manager is created; changing environment
 * variables does not interrupt an already-running scheduler.
 */
export function resolveSeriesSchedulerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): SeriesSchedulerRuntimeConfig {
  const enabledValue = env.OTT_ENABLE_SERIES_SCHEDULER?.trim().toLowerCase();
  const concurrencyValue = env.OTT_SERIES_MATCH_CONCURRENCY?.trim() || '1';
  const concurrency2Value = env.OTT_ENABLE_SERIES_CONCURRENCY_2?.trim().toLowerCase();
  if (enabledValue && enabledValue !== 'true' && enabledValue !== 'false') {
    throw new Error('OTT_ENABLE_SERIES_SCHEDULER must be true or false');
  }
  if (concurrency2Value && concurrency2Value !== 'true' && concurrency2Value !== 'false') {
    throw new Error('OTT_ENABLE_SERIES_CONCURRENCY_2 must be true or false');
  }
  if (concurrencyValue !== '1' && concurrencyValue !== '2') {
    throw new Error('OTT_SERIES_MATCH_CONCURRENCY must be 1 or 2');
  }
  const enabled = enabledValue === 'true';
  const concurrency = Number(concurrencyValue) as 1 | 2;
  const concurrency2Enabled = concurrency2Value === 'true';
  if (concurrency === 2 && (!enabled || !concurrency2Enabled)) {
    throw new Error(
      'Concurrency 2 requires OTT_ENABLE_SERIES_SCHEDULER=true and ' +
      'OTT_ENABLE_SERIES_CONCURRENCY_2=true',
    );
  }
  return { enabled, concurrency, concurrency2Enabled };
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
  private readonly enableMultiStage: boolean;
  private readonly concurrencyLimit: number;
  private readonly enableBo1MatchScheduler: boolean;
  private readonly qaMaxActiveMatches: 1 | 2;
  private readonly onBo1SchedulerCheckpoint?: (checkpoint: MatchSchedulerCheckpoint) => void;
  private readonly commitCoordinator: TournamentCommitCoordinator;
  private readonly activeSchedulers = new Map<string, { cancel(reason?: unknown): void; stopDispatching?(): void }>();
  private readonly cancelledTournaments = new Set<string>();
  private readonly activePairingExecutions = new Set<string>();
  private readonly closeWaiters = new Set<() => void>();
  private readonly pendingResultWrites = new Map<string, Set<Promise<void>>>();
  private readonly terminalTransitionLocks = new Map<string, Promise<void>>();
  private readonly tournamentWriteLocks = new Map<string, Promise<void>>();
  private readonly tournamentMutationLocks = new Map<string, Promise<void>>();
  private readonly persistenceTimeoutMs: number;
  private readonly validateSourceRevision?: (execution: SourceRevisionExecution) => Promise<boolean>;
  private readonly validateTournamentRevisions?: (executions: SourceRevisionExecution[]) => Promise<{ valid: boolean; pending: boolean; error?: string }>;
  private readonly resolveSourceRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>;
  private readonly sourceRevisionExecutor?: SourceRevisionExecutor;
  private matchJobStore?: MatchJobStore;
  private matchJobWorkerId = `manager-${randomUUID()}`;
  private matchJobLeaseMs = 5 * 60_000;
  private fairMatchDispatcher?: FairMatchDispatcher<ExecutedMatchResult>;
  private matchAdmissionController?: (activeDispatches: number) => boolean;
  private projectionInvalidator?: (tournamentId: string, scope: 'tournament' | 'live') => void;
  private readonly fairRegionCursors = new Map<string, number>();
  private readonly liveSnapshots = new Map<string, { tournamentId: string; snapshot: LiveMatchSnapshot; expiresAt: number }>();
  private readonly liveHistories = new Map<string, LiveMatchSnapshot[]>();
  private readonly liveSubscribers = new Map<string, Set<(snapshot: LiveMatchSnapshot) => void>>();
  private shuttingDown = false;
  private closeRequested = false;
  private closeFinalized = false;

  constructor(config: TournamentAppConfig) {
    this.repository = config.repository;
    this.executor = config.executor;
    this.defaultMatchConfig = { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...config.defaultMatchConfig };
    this.defaultScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...config.defaultScoringConfig };
    this.enableMultiStage = config.enableMultiStage ?? false;
    this.concurrencyLimit = config.concurrencyLimit && config.concurrencyLimit > 0 ? config.concurrencyLimit : 1;
    this.enableBo1MatchScheduler = config.enableBo1MatchScheduler ?? false;
    const requestedConcurrency = config.seriesMatchConcurrency ?? (config.qaMaxActiveMatches === 2 ? 2 : 1);
    if (requestedConcurrency !== 1 && requestedConcurrency !== 2) {
      throw new RangeError('Series match concurrency must be 1 or 2');
    }
    const concurrency2Enabled = config.enableSeriesConcurrency2 === true || config.qaMaxActiveMatches === 2;
    if (requestedConcurrency === 2 && !concurrency2Enabled) {
      throw new Error('Series match concurrency 2 requires explicit enableSeriesConcurrency2=true');
    }
    this.qaMaxActiveMatches = requestedConcurrency;
    this.onBo1SchedulerCheckpoint = config.onBo1SchedulerCheckpoint;
    this.commitCoordinator = new TournamentCommitCoordinator(this.repository);
    this.persistenceTimeoutMs = config.persistenceTimeoutMs ?? 5000;
    this.validateSourceRevision = config.validateSourceRevision;
    this.validateTournamentRevisions = config.validateTournamentRevisions;
    this.resolveSourceRevision = config.resolveSourceRevision;
    this.sourceRevisionExecutor = config.sourceRevisionExecutor;
    this.matchJobStore = config.matchJobStore;
    this.matchJobWorkerId = config.matchJobWorkerId ?? this.matchJobWorkerId;
    this.matchJobLeaseMs = Math.max(1_000, config.matchJobLeaseMs ?? this.matchJobLeaseMs);
  }

  setMatchJobStore(store: MatchJobStore, workerId: string, leaseMs = this.matchJobLeaseMs): void {
    this.matchJobStore = store;
    this.matchJobWorkerId = workerId;
    this.matchJobLeaseMs = Math.max(1_000, leaseMs);
  }

  setFairMatchDispatcher(dispatcher: FairMatchDispatcher<ExecutedMatchResult>): void {
    this.fairMatchDispatcher = dispatcher;
  }

  setMatchAdmissionController(admission: ((activeDispatches: number) => boolean) | undefined): void {
    this.matchAdmissionController = admission;
  }

  setProjectionInvalidator(invalidator: ((tournamentId: string, scope: 'tournament' | 'live') => void) | undefined): void {
    this.projectionInvalidator = invalidator;
  }

  isMultiStageEnabled(): boolean {
    return this.enableMultiStage;
  }

  /** Release repository ownership after callers have stopped submitting work. */
  beginShutdown(): void {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const scheduler of this.activeSchedulers.values()) scheduler.stopDispatching?.();
    this.fairMatchDispatcher?.stopDispatching();
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async close(): Promise<void> {
    this.beginShutdown();
    this.closeRequested = true;
    if (this.closeFinalized) return;
    if (this.activeSchedulers.size > 0 || this.activePairingExecutions.size > 0 || this.pendingResultWrites.size > 0) {
      await new Promise<void>(resolve => this.closeWaiters.add(resolve));
    }
    if (this.closeFinalized) return;
    this.liveSnapshots.clear();
    this.liveHistories.clear();
    this.liveSubscribers.clear();
    this.repository.close?.();
    this.closeFinalized = true;
  }

  private notifyCloseWaiters(): void {
    if (!this.closeRequested) return;
    if (this.activeSchedulers.size > 0 || this.activePairingExecutions.size > 0 || this.pendingResultWrites.size > 0) return;
    for (const resolve of this.closeWaiters) resolve();
    this.closeWaiters.clear();
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
    this.projectionInvalidator?.(tournamentId, 'live');
    while (this.liveSnapshots.size > 64) {
      const entries = [...this.liveSnapshots.entries()];
      // 1. Prioritize evicting inactive/finished matches first
      const inactive = entries.filter(([, entry]) => entry.snapshot.status !== 'in_progress');
      // 2. If all are in_progress, prefer evicting active matches with NO active subscribers
      const unsubscribedActive = entries.filter(([k, entry]) => entry.snapshot.status === 'in_progress' && !(this.liveSubscribers.get(k)?.size));
      const pool = inactive.length > 0 ? inactive : unsubscribedActive.length > 0 ? unsubscribedActive : entries;
      const oldest = pool.sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
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
      this.projectionInvalidator?.(tournament.tournamentId, 'tournament');
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

  private findTournamentPairing(tournament: Tournament, pairingId: string): TournamentPairing | null {
    if (isMultiStageTournament(tournament)) {
      return findPairingInTournament(tournament, pairingId)?.pairing ?? null;
    }
    return findPairing(tournament.rounds, pairingId);
  }

  private getAllPairings(tournament: Tournament): TournamentPairing[] {
    if (isMultiStageTournament(tournament)) {
      return getAllTournamentPairings(tournament);
    }
    return tournament.rounds.flatMap(round => round.pairings);
  }

  private markPairingInProgress(tournament: Tournament, pairing: TournamentPairing, matchId: string): boolean {
    if (isMultiStageTournament(tournament)) {
      if (pairing.status !== 'scheduled') return false;
      pairing.status = 'in_progress';
      pairing.matchId = matchId;
      pairing.startedAt = new Date().toISOString();
      return true;
    }
    return markPairingInProgress(tournament.rounds, pairing.pairingId, matchId);
  }

  private markPairingCompleted(tournament: Tournament, pairing: TournamentPairing, record: TournamentMatchRecord): void {
    if (isMultiStageTournament(tournament)) {
      commitMatchResultAndResolveSlots(tournament, pairing.pairingId, record);
    } else {
      markPairingCompleted(tournament.rounds, pairing.pairingId, record);
    }
  }

  private getNextPairing(tournament: Tournament): TournamentPairing | null {
    if (isMultiStageTournament(tournament)) {
      const currentStage = getCurrentStage(tournament);
      if (!currentStage || currentStage.status !== 'in_progress') {
        return null;
      }
      if (currentStage.regions) {
        for (const region of currentStage.regions) {
          if (region.status !== 'completed') {
            for (const round of region.rounds) {
              for (const pairing of round.pairings) {
                if (canPairingExecute(pairing)) return pairing;
              }
            }
          }
        }
      }
      if (currentStage.groups) {
        for (const group of currentStage.groups) {
          if (group.status !== 'completed') {
            for (const round of group.rounds) {
              for (const pairing of round.pairings) {
                if (canPairingExecute(pairing)) return pairing;
              }
            }
          }
        }
      }
      if (currentStage.rounds) {
        for (const round of currentStage.rounds) {
          for (const pairing of round.pairings) {
            if (canPairingExecute(pairing)) return pairing;
          }
        }
      }
      return null;
    }
    return getNextEligiblePairing(tournament.rounds);
  }

  /** Select one eligible region at a time in round-robin order. */
  private getNextFairPairing(tournament: Tournament): TournamentPairing | null {
    if (!isMultiStageTournament(tournament)) return this.getNextPairing(tournament);
    const currentStage = getCurrentStage(tournament);
    if (!currentStage || currentStage.status !== 'in_progress') return null;
    const regions = currentStage.regions ?? [];
    if (regions.length === 0) return this.getNextPairing(tournament);

    const start = this.fairRegionCursors.get(tournament.tournamentId) ?? 0;
    for (let offset = 0; offset < regions.length; offset += 1) {
      const index = (start + offset) % regions.length;
      const region = regions[index]!;
      if (region.status === 'completed') continue;
      for (const round of region.rounds) {
        for (const pairing of round.pairings) {
          if (isPairingDispatchEligible(tournament, pairing)) {
            this.fairRegionCursors.set(tournament.tournamentId, (index + 1) % regions.length);
            return pairing;
          }
        }
      }
    }
    return this.getNextPairing(tournament);
  }

  private isTournamentFinished(tournament: Tournament): boolean {
    if (isMultiStageTournament(tournament)) {
      return isTournamentComplete(tournament);
    }
    return isScheduleComplete(tournament.rounds);
  }

  /**
   * Create a new tournament
   */
  async createTournament(
    tournamentId: string,
    name: string,
    format: TournamentFormat = this.enableMultiStage ? NEW_TOURNAMENT_FORMAT : 'single_round_robin',
    matchConfig?: Partial<TournamentMatchConfig>,
    scoringConfig?: Partial<TournamentScoringConfig>
  ): Promise<TournamentOperationResult<Tournament>> {
    if (format === 'multi_stage' && !this.enableMultiStage) {
      return { success: false, error: 'Multi-stage tournament format is disabled by feature flag' };
    }

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

    if (tournament.configurationVersion === 2) {
      tournament.format = NEW_TOURNAMENT_FORMAT;
      tournament.matchConfig.bestOf = NEW_TOURNAMENT_BEST_OF;
      if (matchConfig?.turnTimeoutMs === undefined) tournament.matchConfig.turnTimeoutMs = NEW_TOURNAMENT_TURN_TIMEOUT_MS;
    }

    if (tournament.configurationVersion === 2) {
      tournament.scoringConfig = { ...NEW_TOURNAMENT_SCORING_CONFIG };
    } else if (scoringConfig) {
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
    await this.syncScheduledLifecycle(new Date(), tournamentId);
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
    await this.syncScheduledLifecycle();
    return this.repository.list();
  }

  /** Apply due publication-independent registration transitions after restart and between scheduler ticks. */
  async syncScheduledLifecycle(now = new Date(), tournamentId?: string): Promise<number> {
    const candidates = tournamentId
      ? [await this.repository.load(tournamentId)]
      : await this.repository.list();
    let changedCount = 0;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const result = await this.mutateTournament(candidate.tournamentId, async tournament => {
        const changed = applyScheduledLifecycle(tournament, now);
        if (!changed.opened && !changed.closed) return { success: true, data: false };
        await this.saveTournament(tournament);
        return { success: true, data: true };
      });
      if (result.success && result.data) changedCount += 1;
    }
    return changedCount;
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
    details: string | TournamentUpdateDetails
  ): Promise<TournamentOperationResult<Tournament>> {
    const update = typeof details === 'string' ? { name: details } : details;
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
        return { success: false, error: `Cannot edit: tournament status is ${tournament.status}` };
      }
      if (update.name !== undefined) {
        const trimmed = update.name.trim();
        if (!trimmed || trimmed.length > 100) {
          return { success: false, error: 'Tournament name must be between 1 and 100 characters' };
        }
        tournament.name = trimmed;
      }
      if (update.description !== undefined) {
        tournament.description = typeof update.description === 'string' ? update.description.trim().slice(0, 2000) : '';
      }
      if (update.organizerInfo !== undefined) {
        tournament.organizerInfo = typeof update.organizerInfo === 'string' ? update.organizerInfo.trim().slice(0, 500) : '';
      }
      if (update.contactInfo !== undefined) {
        tournament.contactInfo = typeof update.contactInfo === 'string' ? update.contactInfo.trim().slice(0, 500) : '';
      }
      if (update.rulesNotes !== undefined) {
        tournament.rulesNotes = typeof update.rulesNotes === 'string' ? update.rulesNotes.trim().slice(0, 2000) : '';
      }
      if (update.policyNotes !== undefined) {
        tournament.policyNotes = typeof update.policyNotes === 'string' ? update.policyNotes.trim().slice(0, 2000) : '';
      }

      const settings = validateTournamentSettingsUpdate(tournament, update);
      if (!settings.valid) return { success: false, error: settings.error };
      if (update.schedule) tournament.schedule = { ...DEFAULT_TOURNAMENT_SCHEDULE, ...(tournament.schedule ?? {}), ...update.schedule };
      if (update.format !== undefined) tournament.format = update.format;
      if (update.matchConfig) tournament.matchConfig = { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...(tournament.matchConfig ?? {}), ...update.matchConfig };
      if (update.scoringConfig) tournament.scoringConfig = { ...DEFAULT_SCORING_CONFIG, ...(tournament.scoringConfig ?? {}), ...update.scoringConfig };
      if (update.rulesConfig) tournament.rulesConfig = { ...DEFAULT_TOURNAMENT_RULES, ...(tournament.rulesConfig ?? {}), ...update.rulesConfig };
      if (update.botLimits) tournament.botLimits = { ...DEFAULT_TOURNAMENT_BOT_LIMITS, ...(tournament.botLimits ?? {}), ...update.botLimits };
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  async deleteTournament(tournamentId: string): Promise<TournamentOperationResult<null>> {
    return this.mutateTournament(tournamentId, async tournament => {
      await this.repository.delete(tournamentId);
      this.projectionInvalidator?.(tournamentId, 'tournament');
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
      const lifecycle = applyScheduledLifecycle(tournament, new Date());
      if (lifecycle.opened || lifecycle.closed) await this.saveTournament(tournament);
      if (tournament.status !== 'draft' && tournament.status !== 'registration_open') {
        return { success: false, error: `Cannot register: tournament status is ${tournament.status}` };
      }
      if (tournament.participants.length >= getMaxParticipants(tournament.format)) {
        return { success: false, error: 'Maximum participants reached' };
      }
      if (tournament.participants.some(p => p.participantId === participantId)) {
        return { success: false, error: `Participant ${participantId} already registered` };
      }
      if (!bot.command || !bot.botId) return { success: false, error: 'Bot must have botId and command' };
      const sourceExecution = bot.execution?.kind === 'source-revision' ? bot.execution : null;
      if (sourceExecution) {
        if (!['cpp', 'python3'].includes(sourceExecution.runtimeId)) return { success: false, error: 'This source runtime is not allowed for tournament execution' };
        const configured = executionConfiguration(tournament);
        const competitorBotCount = tournament.participants.filter(participant => participant.bot.execution?.kind === 'source-revision' && participant.bot.execution.competitorId === sourceExecution.competitorId).length;
        if (competitorBotCount >= maxBotsPerCompetitor(tournament, configured.botLimits)) return { success: false, error: 'Competitor Bot limit reached for this tournament' };
      }
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
    await this.syncScheduledLifecycle(new Date(), tournamentId);
    return this.transitionStatus(tournamentId, 'registration_open');
  }

  /** Close registration without starting execution. */
  async closeRegistration(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status === 'registration_closed') return { success: true, data: tournament };
      const lifecycle = applyScheduledLifecycle(tournament, new Date());
      if (lifecycle.opened || lifecycle.closed) {
        await this.saveTournament(tournament);
        if (lifecycle.closed) return { success: true, data: tournament };
      }
      const validTransitions = VALID_STATUS_TRANSITIONS[tournament.status] || [];
      if (!validTransitions.includes('registration_closed')) {
        return { success: false, error: `Invalid status transition: ${tournament.status} -> registration_closed` };
      }
      if ((tournament.participationRequests ?? []).some(request => request.status === 'pending')) {
        return { success: false, error: 'Cannot close registration while participation requests are pending' };
      }
      tournament.status = 'registration_closed';
      tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
      tournament.registrationClosedReason = 'manual';
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Generate schedule (must be called after registration closes)
   */
  async generateSchedule(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.format === 'multi_stage' && !this.enableMultiStage) {
        return { success: false, error: 'Multi-stage tournament format is disabled by feature flag' };
      }
      if (tournament.configurationVersion === 2 && (tournament.format !== NEW_TOURNAMENT_FORMAT || tournament.matchConfig.bestOf !== NEW_TOURNAMENT_BEST_OF)) {
        return { success: false, error: 'New tournaments must use multi_stage with Group Stage BO2 and Knockout BO3' };
      }
      if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') {
        return { success: false, error: `Cannot generate schedule: tournament status is ${tournament.status}` };
      }
      const pending = (tournament.participationRequests ?? []).filter(request => request.status === 'pending');
      if (pending.length) return { success: false, error: 'Cannot generate schedule while participation requests are pending' };
      const minParticipants = MIN_PARTICIPANTS[tournament.format] || 2;
      if (tournament.participants.length < minParticipants) {
        return { success: false, error: `Need at least ${minParticipants} participants for ${tournament.format}` };
      }
      const maxParticipants = getMaxParticipants(tournament.format);
      if (tournament.participants.length > maxParticipants) {
        return { success: false, error: `Too many participants for ${tournament.format} (max ${maxParticipants})` };
      }
      if (this.validateTournamentRevisions) {
        const revisions = tournament.participants.flatMap(participant => {
          const execution = participant.bot.execution;
          return execution?.kind === 'source-revision' ? [execution] : [];
        });
        const validation = await this.validateTournamentRevisions(revisions);
        if (!validation.valid) {
          return { success: false, error: validation.error ?? (validation.pending ? 'Bot preflight validation is still running' : 'One or more Bot revisions failed preflight validation') };
        }
      }

      if (tournament.format === 'multi_stage') {
        const configuredRegionCount = Number(tournament.metadata?.regionCount);
        const configuredQualifiersPerRegion = Number(tournament.metadata?.qualifiersPerRegion);
        const multiStage = createMultiStageTournament({
          tournamentId: tournament.tournamentId,
          name: tournament.name,
          participants: tournament.participants,
          matchConfig: tournament.matchConfig,
          scoringConfig: tournament.scoringConfig,
          options: {
            ...(Number.isInteger(configuredRegionCount) && configuredRegionCount > 0 ? { regionCount: configuredRegionCount } : {}),
            ...(Number.isInteger(configuredQualifiersPerRegion) && configuredQualifiersPerRegion > 0 ? { qualifiersPerRegion: configuredQualifiersPerRegion } : {}),
          },
          metadata: tournament.metadata,
        });
        tournament.stages = multiStage.stages;
        tournament.rounds = [];
        tournament.status = 'registration_closed';
        tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
        tournament.registrationClosedReason = tournament.registrationClosedReason ?? 'manual';
        tournament.standings = computeStandings(tournament.participants, [], tournament.scoringConfig);
        await this.saveTournament(tournament);
        return { success: true, data: tournament };
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
      tournament.registrationClosedReason = tournament.registrationClosedReason ?? 'manual';
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
      const hasSchedule = isMultiStageTournament(tournament)
        ? Boolean(tournament.stages && tournament.stages.length > 0)
        : tournament.rounds.length > 0;
      if (tournament.status !== 'registration_closed' && !(tournament.status === 'registration_open' && !hasSchedule)) {
        return { success: false, error: `Cannot start: tournament status is ${tournament.status}` };
      }
      if (!hasSchedule) return { success: false, error: 'No schedule generated. Call generateSchedule first.' };
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
      const lifecycle = applyScheduledLifecycle(tournament, new Date());
      if (lifecycle.opened || lifecycle.closed) await this.saveTournament(tournament);
      if (tournament.status !== 'registration_open') return { success: false, error: `Cannot request participation: tournament status is ${tournament.status}` };
      const requests = tournament.participationRequests ?? (tournament.participationRequests = []);
      const runtimeConfig = executionConfiguration(tournament);
      const sourceExecution = request.botSnapshot?.execution?.kind === 'source-revision' ? request.botSnapshot.execution : null;
      const requestedName = request.participantName.trim();
      const normalizedName = requestedName.toLocaleLowerCase();
      const activeRequests = requests.filter(item => item.status === 'pending' || item.status === 'approved');
      const ownName = tournament.participants.find(participant => participant.bot?.execution?.kind === 'source-revision'
        && (participant.bot.execution as { competitorId?: string }).competitorId === request.competitorId)?.name
        || activeRequests.find(item => item.competitorId === request.competitorId)?.participantName;
      if (ownName && ownName.trim().toLocaleLowerCase() !== normalizedName) {
        return { success: false, error: 'Each competitor must use one consistent tournament display name' };
      }
      const nameInUse = tournament.participants.some(participant => participant.name?.trim().toLocaleLowerCase() === normalizedName
        && (participant.bot?.execution?.kind !== 'source-revision'
          || (participant.bot.execution as { competitorId?: string }).competitorId !== request.competitorId))
        || activeRequests.some(item => item.participantName.trim().toLocaleLowerCase() === normalizedName
          && item.competitorId !== request.competitorId);
      if (nameInUse) return { success: false, error: 'Tournament display name is already in use' };
      if (sourceExecution && !['cpp', 'python3'].includes(sourceExecution.runtimeId)) {
        return { success: false, error: 'This source runtime is not allowed for tournament execution' };
      }
      const duplicate = requests.find(existing => existing.competitorId === request.competitorId && existing.botId === request.botId && (existing.status === 'pending' || existing.status === 'approved'));
      if (duplicate) return { success: false, error: 'An active participation request already exists' };
      const competitorBotCount = tournament.participants.filter(participant => participant.bot?.execution?.kind === 'source-revision' && participant.bot?.execution?.competitorId === request.competitorId).length
        + requests.filter(item => item.competitorId === request.competitorId && item.status === 'pending').length;
      if (competitorBotCount >= maxBotsPerCompetitor(tournament, runtimeConfig.botLimits)) {
        return { success: false, error: 'Competitor Bot limit reached for this tournament' };
      }
      if (tournament.participants.length + requests.filter(item => item.status === 'pending').length >= getMaxParticipants(tournament.format)) {
        return { success: false, error: 'Maximum participants reached' };
      }
      const created: ParticipationRequest = {
        ...request,
        participantName: requestedName,
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
      const hasSchedule = isMultiStageTournament(tournament)
        ? Boolean(tournament.stages && tournament.stages.length > 0)
        : tournament.rounds.length > 0;
      if (hasSchedule) return { success: false, error: 'Participation requests cannot be reviewed after scheduling' };
      const request = (tournament.participationRequests ?? []).find(item => item.requestId === requestId);
      if (!request) return { success: false, error: 'Participation request not found' };
      if (request.status !== 'pending') return { success: false, error: 'Participation request has already been reviewed' };
      if (decision === 'approve' && tournament.participants.some(participant => participant.bot.botId === request.botId)) {
        return { success: false, error: 'This Bot is already a tournament participant' };
      }
      const runtimeConfig = executionConfiguration(tournament);
      if (decision === 'approve' && tournament.participants.length >= getMaxParticipants(tournament.format)) {
        return { success: false, error: 'Maximum participants reached' };
      }
      const competitorBotCount = tournament.participants.filter(participant => participant.bot.execution?.kind === 'source-revision' && participant.bot.execution.competitorId === request.competitorId).length;
      if (decision === 'approve' && competitorBotCount >= maxBotsPerCompetitor(tournament, runtimeConfig.botLimits)) {
        return { success: false, error: 'Competitor Bot limit reached for this tournament' };
      }
      const sourceExecution = request.botSnapshot.execution?.kind === 'source-revision' ? request.botSnapshot.execution : null;
      if (decision === 'approve' && sourceExecution) {
        if (!['cpp', 'python3'].includes(sourceExecution.runtimeId)) {
          return { success: false, error: 'This source runtime is not allowed for tournament execution' };
        }
        if (sourceExecution.revisionId !== request.revisionId || sourceExecution.runtimeId !== request.runtimeId || sourceExecution.sourceDigest !== request.sourceDigest ||
            (sourceExecution.executionMode ?? 'raw') !== (request.executionMode ?? 'raw') ||
            sourceExecution.sdkVersion !== request.sdkVersion || sourceExecution.sdkDigest !== request.sdkDigest) {
          return { success: false, error: 'Participation request revision metadata is inconsistent' };
        }
        if (!this.validateSourceRevision) {
          return { success: false, error: 'Source revision approval requires Bot preflight validation' };
        }
        if (!await this.validateSourceRevision(sourceExecution)) {
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

  async undoParticipationRequestReview(
    tournamentId: string,
    requestId: string,
    reviewerId: string
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'registration_open' && tournament.status !== 'registration_closed') {
        return { success: false, error: `Cannot undo participation request review while tournament status is ${tournament.status}` };
      }
      const hasSchedule = isMultiStageTournament(tournament)
        ? Boolean(tournament.stages && tournament.stages.length > 0)
        : tournament.rounds.length > 0;
      if (hasSchedule) return { success: false, error: 'Participation request reviews cannot be undone after scheduling' };
      const request = (tournament.participationRequests ?? []).find(item => item.requestId === requestId);
      if (!request) return { success: false, error: 'Participation request not found' };
      if (request.status !== 'approved' && request.status !== 'rejected') {
        return { success: false, error: 'Only approved or rejected participation requests can be undone' };
      }
      if (request.status === 'approved') {
        const participantId = `p-${request.requestId}`;
        const participantIndex = tournament.participants.findIndex(participant => participant.participantId === participantId);
        if (participantIndex < 0) return { success: false, error: 'Approved participant not found' };
        tournament.participants.splice(participantIndex, 1);
      }
      request.status = 'pending';
      request.reviewedAt = null;
      request.reviewedBy = null;
      request.rejectionReason = null;
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Start the next multi-stage stage after the organizer explicitly confirms
   * the transition. This only changes the persisted stage gate; execution is
   * still performed by the normal run_all action.
   */
  async startNextStage(tournamentId: string): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (!isMultiStageTournament(tournament)) {
        return { success: false, error: 'Stage-by-stage execution is only available for multi_stage tournaments' };
      }
      if (tournament.status !== 'running') {
        return { success: false, error: `Tournament not running (status: ${tournament.status})` };
      }
      const pendingTiebreakers = this.getAllPairings(tournament).filter(
        pairing => pairing.status === 'pending_tiebreaker' || pairing.tiebreakerStatus === 'pending'
      );
      if (pendingTiebreakers.length > 0) {
        return { success: false, error: `${pendingTiebreakers.length} match(es) require tiebreaker resolution` };
      }
      const currentStage = getCurrentStage(tournament);
      if (currentStage?.status === 'in_progress') {
        return { success: false, error: 'The current stage is still in progress' };
      }
      const activation = activateNextStage(tournament);
      if (!activation.activated || !activation.stage) {
        return { success: false, error: activation.error ?? 'No stage is ready to start' };
      }
      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
  }

  /**
   * Run the next eligible match
   */
  async runNextMatch(tournamentId: string, signal?: AbortSignal): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    if (this.shuttingDown) return { success: false, error: 'Tournament execution paused for shutdown' };
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;

    if (tournament.status !== 'running') {
      return { success: false, error: `Tournament not running (status: ${tournament.status})` };
    }

    if (isMultiStageTournament(tournament) && getCurrentStage(tournament)?.status !== 'in_progress') {
      return { success: false, error: 'The next stage is waiting for the organizer to start it' };
    }

    const pairing = this.getNextPairing(tournament);
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
    if (isMultiStageTournament(tournament) && getCurrentStage(tournament)?.status !== 'in_progress') {
      return { success: false, error: 'The next stage is waiting for the organizer to start it' };
    }
    if (signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }

    await this.reconcileInterruptedPairings(tournament);
    // Persist reconciliation before selecting the next pairing. In batch mode
    // the start transition is intentionally not persisted for every match;
    // therefore a committed result may otherwise be applied only in memory and
    // be lost again if the process restarts before the next save.
    await this.saveTournament(tournament);

    // A new explicit run request is the retry boundary for failed attempts.
    // Do not retry them inside the same invocation, which could loop forever
    // on a persistent Docker or infrastructure failure.
    // Note: Do NOT automatically retry pairings with unresolved elimination draws (tiebreakers pending).
    const allPairings = this.getAllPairings(tournament);
    const failedPairings = allPairings.filter(pairing =>
      pairing.status === 'failed' &&
      pairing.failureCode !== 'UNRESOLVED_DRAW' &&
      pairing.tiebreakerStatus !== 'pending'
    );
    if (failedPairings.length > 0) {
      for (const failedPairing of failedPairings) {
        failedPairing.status = 'scheduled';
        failedPairing.failureReason = null;
        failedPairing.failureCode = null;
      }
      await this.saveTournament(tournament);
    }

    if (this.matchJobStore) {
      const committed = await this.repository.listMatchResults(tournamentId);
      await this.matchJobStore.ensureForTournament(tournamentId, allPairings);
      await this.matchJobStore.reconcile(tournamentId, allPairings, committed.filter(record => !record.seriesGameOf).map(record => record.pairingId));
    }

    if (this.fairMatchDispatcher) {
      const dispatched = await this.fairMatchDispatcher.submit(
        tournamentId,
        signal => this.runFairMatchQuantum(tournamentId, signal),
        signal,
      );
      if (dispatched.cancelled || this.shuttingDown || signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      if (dispatched.failures.length > 0) {
        return { success: false, error: `${dispatched.failures.length} match(es) failed. Review the failed pairings and run execution again to retry.` };
      }
      return { success: true, data: dispatched.results };
    }

    const executionConfig = executionConfiguration(tournament);
    const useSeriesScheduler = this.enableBo1MatchScheduler &&
      (executionConfig.matchConfig.bestOf === 2 || executionConfig.matchConfig.bestOf === 3 || isMultiStageTournament(tournament));
    if (this.enableBo1MatchScheduler && (useSeriesScheduler || (executionConfig.matchConfig.bestOf === 1 && !isMultiStageTournament(tournament)))) {
      return this.runAllMatchesWithScheduler(tournamentId, tournament, signal, useSeriesScheduler);
    }

    const results: ExecutedMatchResult[] = [];
    const failures: string[] = [];
    let pairing = this.getNextPairing(tournament);

    while (pairing) {
      if (this.shuttingDown || signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      const result = await this.runPairingWithDurableJob(tournament, pairing, signal);
      if (result.error === 'CAPACITY_ADMISSION_PAUSED') {
        await new Promise<void>(resolve => setTimeout(resolve, 250));
        continue;
      }
      if (result.success && result.data) {
        results.push(result.data);
        if (this.shuttingDown || signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
          return { success: false, error: 'Tournament execution cancelled' };
        }
        pairing = this.getNextPairing(tournament);
      } else {
        if (signal?.aborted || this.cancelledTournaments.has(tournamentId) || result.error === 'Tournament execution cancelled') {
          return { success: false, error: 'Tournament execution cancelled' };
        }
        failures.push(result.error ?? `Pairing ${pairing.pairingId} failed`);
        pairing = this.getNextPairing(tournament);
      }
    }

    const updatedAllPairings = this.getAllPairings(tournament);
    const pendingTiebreakers = updatedAllPairings.filter(p => p.status === 'pending_tiebreaker' || p.tiebreakerStatus === 'pending');
    if (failures.length > 0 || pendingTiebreakers.length > 0) {
      if (pendingTiebreakers.length > 0 && failures.length === 0) {
        return { success: false, error: `${pendingTiebreakers.length} match(es) require tiebreaker resolution` };
      }
      return { success: false, error: `${failures.length} match(es) failed. Review the failed pairings and run execution again to retry.` };
    }

    // Check if tournament is complete
    if (!signal?.aborted && !this.cancelledTournaments.has(tournamentId) && this.isTournamentFinished(tournament)) {
      await this.completeTournament(tournamentId);
    }

    return { success: true, data: results };
  }

  private async runFairMatchQuantum(tournamentId: string, signal?: AbortSignal): Promise<FairMatchQuantum<ExecutedMatchResult>> {
    if (this.shuttingDown) return { done: true, error: 'Tournament execution paused for shutdown' };
    const loaded = await this.loadTournament(tournamentId);
    if (!loaded.success || !loaded.data) return { done: true, error: loaded.error ?? `Tournament ${tournamentId} not found` };
    const tournament = loaded.data;
    if (tournament.status !== 'running') return { done: true, error: `Tournament not running (status: ${tournament.status})` };
    if (this.matchAdmissionController && !this.matchAdmissionController(0)) {
      return { done: false, deferred: true, retryAfterMs: 250 };
    }
    const pairing = this.getNextFairPairing(tournament);
    if (!pairing) {
      const pendingTiebreakers = this.getAllPairings(tournament).filter(p => p.status === 'pending_tiebreaker' || p.tiebreakerStatus === 'pending');
      if (pendingTiebreakers.length > 0) return { done: true, error: `${pendingTiebreakers.length} match(es) require tiebreaker resolution` };
      if (!this.cancelledTournaments.has(tournamentId) && this.isTournamentFinished(tournament)) await this.completeTournament(tournamentId);
      return { done: true };
    }
    const result = await this.runPairingWithDurableJob(tournament, pairing, signal);
    if (result.error === 'CAPACITY_ADMISSION_PAUSED') return { done: false, deferred: true, retryAfterMs: 250 };
    if (result.success && result.data) return { done: false, result: result.data };
    if (signal?.aborted || this.cancelledTournaments.has(tournamentId) || result.error === 'Tournament execution cancelled') {
      return { done: true, error: 'Tournament execution cancelled' };
    }
    return { done: false, error: result.error ?? `Pairing ${pairing.pairingId} failed` };
  }

  private async runPairingWithDurableJob(
    tournament: Tournament,
    pairing: TournamentPairing,
    signal?: AbortSignal,
  ): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    if (this.shuttingDown) return { success: false, error: 'Tournament execution paused for shutdown' };
    if (!this.matchJobStore) return this.runPairing(tournament, pairing, signal, { persistStart: false });
    if (this.matchAdmissionController && !this.matchAdmissionController(0)) {
      return { success: false, error: 'CAPACITY_ADMISSION_PAUSED' };
    }
    const claim = await this.matchJobStore.claim(tournament.tournamentId, pairing.pairingId, this.matchJobWorkerId, this.matchJobLeaseMs);
    if (!claim) return { success: false, error: `Pairing ${pairing.pairingId} is already claimed or completed` };
    const heartbeat = setInterval(() => { void this.matchJobStore?.renew(claim, this.matchJobLeaseMs); }, Math.max(1_000, Math.floor(this.matchJobLeaseMs / 3)));
    heartbeat.unref?.();
    try {
      if (!(await this.matchJobStore.assertLease(claim))) return { success: false, error: `Pairing ${pairing.pairingId} lease expired` };
      const result = await this.runPairing(tournament, pairing, signal, {
        persistStart: false,
        assertLease: async () => this.matchJobStore!.assertLease(claim),
      });
      if (result.success) await this.matchJobStore.complete(claim);
      else await this.matchJobStore.release(claim, result.error);
      return result;
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * Opt-in BO1 path. Execution, durable claiming, and durable commit are
   * deliberately separate operations so runPairing remains the legacy/series
   * implementation and cannot duplicate result or replay writes.
   */
  private async runAllMatchesWithScheduler(
    tournamentId: string,
    initialTournament: Tournament,
    signal?: AbortSignal,
    seriesAware = false,
  ): Promise<TournamentOperationResult<ExecutedMatchResult[]>> {
    let authoritative: Tournament | null = initialTournament;
    const jobClaims = new Map<string, MatchJobClaim>();
    const jobHeartbeats = new Map<string, ReturnType<typeof setInterval>>();
    const scheduler = new MatchScheduler<SchedulerExecution>(
      {
        execute: async (pairing, schedulerSignal) => {
          const tournament = seriesAware ? await this.repository.load(tournamentId) : authoritative;
          if (!tournament) throw new Error('Authoritative tournament snapshot is unavailable');

          const claimedPairing = seriesAware ? this.findTournamentPairing(tournament, pairing.pairingId) : pairing;
          if (!claimedPairing) {
            return { kind: 'failed', error: new Error(`Pairing ${pairing.pairingId} is missing from the authoritative snapshot`) };
          }

          if (seriesAware) {
            const participantA = tournament.participants.find(p => p.participantId === claimedPairing.participantA);
            const participantB = claimedPairing.participantB === null
              ? null
              : tournament.participants.find(p => p.participantId === claimedPairing.participantB);
            if (!participantA || !participantB) {
              return { kind: 'failed', error: new Error(`Participants for pairing ${claimedPairing.pairingId} are unavailable`) };
            }
            const format = this.getPairingSeriesFormat(tournament, claimedPairing);
            if (format === 'bo1') {
              return { kind: 'failed', error: new Error(`Series scheduler received BO1 pairing ${claimedPairing.pairingId}`) };
            }
            const result = await this.runSeriesPairing(
              tournament,
              claimedPairing,
              participantA,
              participantB,
              format,
              schedulerSignal,
              {
                claimed: true,
                coordinatorCommit: true,
                assertLease: jobClaims.has(claimedPairing.pairingId)
                  ? async () => this.matchJobStore!.assertLease(jobClaims.get(claimedPairing.pairingId)!)
                  : undefined,
              },
            );
            if (!result.success || !result.data) {
              return { kind: 'failed', error: new Error(result.error ?? `Series ${claimedPairing.pairingId} failed`) };
            }
            return { kind: 'completed', data: { ...result.data, committed: true } };
          }

          const participantA = tournament.participants.find(p => p.participantId === pairing.participantA);
          const participantB = tournament.participants.find(p => p.participantId === pairing.participantB);
          if (!participantA || !participantB) {
            return { kind: 'failed', error: new Error('Participant not found') };
          }

          const matchId = createMatchId(tournamentId, pairing.pairingId);
          const botA: BotDefinition = {
            botId: participantA.bot.botId,
            player: 'A',
            command: participantA.bot.command,
            args: participantA.bot.args,
            env: participantA.bot.env,
            execution: participantA.bot.execution,
          };
          const botB: BotDefinition = {
            botId: participantB.bot.botId,
            player: 'B',
            command: participantB.bot.command,
            args: participantB.bot.args,
            env: participantB.bot.env,
            execution: participantB.bot.execution,
          };
          const configured = executionConfiguration(tournament);
          const matchConfig: MatchConfig = {
            matchId,
            protocolVersion: configured.matchConfig.protocolVersion,
            maxTurns: configured.matchConfig.maxTurns,
            turnTimeoutMs: configured.matchConfig.turnTimeoutMs,
            maxStdoutBytes: configured.matchConfig.maxStdoutBytes,
            maxStderrBytes: configured.matchConfig.maxStderrBytes,
            failurePolicy: configured.matchConfig.failurePolicy,
            maxRetries: configured.matchConfig.maxRetries,
            logRequests: configured.matchConfig.logRequests,
            logResponses: configured.matchConfig.logResponses,
            logStates: configured.matchConfig.logStates,
            ruleModifiers: configured.ruleModifiers,
            resourceLimits: {
              maxMemoryBytes: configured.botLimits.memoryLimitMb * 1024 * 1024,
              maxCpuPercent: configured.botLimits.cpuLimit * 100,
              maxProcesses: configured.botLimits.maxProcesses,
              maxFileSizeBytes: configured.botLimits.maxSourceBytes,
            },
          };

          try {
            const matchResult = await this.executor.executeMatch(
              matchId,
              botA,
              botB,
              matchConfig,
              { onSnapshot: snapshot => this.publishLiveSnapshot(tournamentId, snapshot) },
              schedulerSignal
            );
            if (schedulerSignal.aborted || this.cancelledTournaments.has(tournamentId)) {
              return { kind: 'failed', error: new Error('Tournament execution cancelled') };
            }

            const tournamentMatchRecord: TournamentMatchRecord = {
              matchId,
              pairingId: pairing.pairingId,
              participantA: pairing.participantA,
              participantB: pairing.participantB,
              winner: matchResult.winner,
              terminationReason: matchResult.terminationReason,
              turnCount: matchResult.turnCount,
              durationMs: matchResult.durationMs,
              replayRef: matchId,
              completedAt: new Date().toISOString(),
              executionProvenance: matchResult.metadata?.sourceRevisions as import('@match-runner/types.js').ExecutionProvenance[] | undefined,
              executionDiagnostics: matchResult.metadata?.executionDiagnostics,
            };
            return {
              kind: 'completed',
              data: { matchResult, replay: MatchRunner.createReplay(matchResult), tournamentMatchRecord },
            };
          } catch (error) {
            return { kind: 'failed', error };
          }
        },
      },
      {
        concurrency: this.qaMaxActiveMatches,
        signal,
        onCheckpoint: this.onBo1SchedulerCheckpoint,
        claim: async pairing => {
          if (this.shuttingDown) return false;
          let jobClaim: MatchJobClaim | null = null;
          if (this.matchJobStore) {
            jobClaim = await this.matchJobStore.claim(tournamentId, pairing.pairingId, this.matchJobWorkerId, this.matchJobLeaseMs);
            if (!jobClaim) return false;
            jobClaims.set(pairing.pairingId, jobClaim);
            const heartbeat = setInterval(() => { void this.matchJobStore?.renew(jobClaim!, this.matchJobLeaseMs); }, Math.max(1_000, Math.floor(this.matchJobLeaseMs / 3)));
            heartbeat.unref?.();
            jobHeartbeats.set(pairing.pairingId, heartbeat);
          }
          const claimed = await this.commitCoordinator.claimPairing({
            tournamentId,
            pairingId: pairing.pairingId,
            matchId: createMatchId(tournamentId, pairing.pairingId),
          });
          if (jobClaim && !claimed.success) {
            await this.matchJobStore?.release(jobClaim, 'Tournament pairing claim was rejected');
            return false;
          }
          return {
            claimId: claimed.matchId,
            pairing: claimed.pairing,
            ...(jobClaim ? { jobId: jobClaim.jobId, fencingToken: jobClaim.fencingToken } : {}),
          };
        },
        refresh: async () => {
          const fresh = await this.repository.load(tournamentId);
          if (!fresh) throw new Error(`Tournament ${tournamentId} not found`);
          authoritative = fresh;
          return fresh;
        },
        onComplete: async (pairing, execution) => {
          const jobClaim = jobClaims.get(pairing.pairingId);
          if (jobClaim && !(await this.matchJobStore!.assertLease(jobClaim))) {
            throw new Error(`Durable match job lease expired for ${pairing.pairingId}`);
          }
          if (execution.kind === 'completed') {
            if (execution.data.committed) {
              if (jobClaim) await this.matchJobStore!.complete(jobClaim);
              return;
            }
            if (!execution.data.tournamentMatchRecord) {
              throw new Error(`Scheduler completed pairing ${pairing.pairingId} without a match record`);
            }
            await this.commitCoordinator.commitMatchResult({
              tournamentId,
              pairingId: pairing.pairingId,
              matchResult: execution.data.tournamentMatchRecord,
              replay: execution.data.replay,
            });
            if (jobClaim) await this.matchJobStore!.complete(jobClaim);
            return;
          }

          if (signal?.aborted || this.cancelledTournaments.has(tournamentId)) return;
          const matchId = createMatchId(tournamentId, pairing.pairingId);
          await this.commitCoordinator.releasePairingClaim({ tournamentId, pairingId: pairing.pairingId, matchId });
          if (jobClaim) await this.matchJobStore!.release(jobClaim, execution.error);
          const fresh = await this.repository.load(tournamentId);
          const failedPairing = fresh && this.findTournamentPairing(fresh, pairing.pairingId);
          if (fresh && failedPairing && failedPairing.status === 'scheduled') {
            const failure = classifyMatchExecutionFailure(execution.error);
            failedPairing.status = 'failed';
            failedPairing.failureCode = failure.code;
            failedPairing.failureReason = failure.reason;
            failedPairing.matchId = null;
            failedPairing.startedAt = null;
            await this.saveTournament(fresh);
          }
        },
        cleanup: async pairing => {
          const heartbeat = jobHeartbeats.get(pairing.pairingId);
          if (heartbeat) clearInterval(heartbeat);
          jobHeartbeats.delete(pairing.pairingId);
          jobClaims.delete(pairing.pairingId);
        },
      }
    );

    this.activeSchedulers.set(tournamentId, scheduler);
    let scheduleResult;
    try {
      scheduleResult = await scheduler.run(initialTournament);
    } finally {
      this.activeSchedulers.delete(tournamentId);
      this.notifyCloseWaiters();
    }

    if (scheduleResult.cancelled || this.shuttingDown || signal?.aborted || this.cancelledTournaments.has(tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }

    const failures = [
      ...scheduleResult.failures.map(failure => failure.error),
      ...scheduleResult.completed
        .map(item => item.result)
        .filter((result): result is Extract<SchedulerExecution, { kind: 'failed' }> => result.kind === 'failed')
        .map(result => result.error),
    ];
    if (failures.length > 0) {
      const detail = failures[0] instanceof Error ? ` Details: ${failures[0].message}` : '';
      return { success: false, error: `${failures.length} match(es) failed. Review the failed pairings and run execution again to retry.${detail}` };
    }

    const fresh = await this.repository.load(tournamentId);
    if (!fresh) return { success: false, error: `Tournament ${tournamentId} not found` };
    const pendingTiebreakers = this.getAllPairings(fresh).filter(
      p => p.status === 'pending_tiebreaker' || p.tiebreakerStatus === 'pending'
    );
    if (pendingTiebreakers.length > 0) {
      return { success: false, error: `${pendingTiebreakers.length} match(es) require tiebreaker resolution` };
    }
    if (!this.cancelledTournaments.has(tournamentId) && this.isTournamentFinished(fresh)) {
      await this.completeTournament(tournamentId);
    }

    return {
      success: true,
      data: scheduleResult.completed
        .map(item => item.result)
        .filter((result): result is Extract<SchedulerExecution, { kind: 'completed' }> => result.kind === 'completed')
        .map(result => result.data),
    };
  }

  /**
   * Run a specific pairing by ID
   */
  async runPairingById(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    if (this.shuttingDown) return { success: false, error: 'Tournament execution paused for shutdown' };
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) {
      return { success: false, error: loadResult.error };
    }

    const tournament = loadResult.data;
    const pairing = this.findTournamentPairing(tournament, pairingId);

    if (!pairing) {
      return { success: false, error: `Pairing ${pairingId} not found` };
    }

    if (isMultiStageTournament(tournament)) {
      const currentStage = getCurrentStage(tournament);
      const pairingStage = findPairingInTournament(tournament, pairingId)?.stage;
      if (!currentStage || currentStage.status !== 'in_progress' || pairingStage?.stageId !== currentStage.stageId) {
        return { success: false, error: 'Pairing belongs to a stage that has not been started' };
      }
      if (!canPairingExecute(pairing)) {
        return { success: false, error: `Pairing not in scheduled state (current: ${pairing.status})` };
      }
    } else {
      if (pairing.status !== 'scheduled') {
        return { success: false, error: `Pairing not in scheduled state (current: ${pairing.status})` };
      }

      if (pairing.participantB === null) {
        return { success: false, error: 'Cannot run bye pairing' };
      }
    }

    return this.runPairing(tournament, pairing);
  }

  /** Retry one failed pairing without changing the rest of the schedule. */
  async requeuePairing(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<null>> {
    if (this.shuttingDown) return { success: false, error: 'Tournament execution paused for shutdown' };
    const current = await this.loadTournament(tournamentId);
    if (!current.success || !current.data) return { success: false, error: current.error };
    const pairing = this.findTournamentPairing(current.data, pairingId);
    if (!pairing) return { success: false, error: `Pairing ${pairingId} not found` };
    if (pairing.participantB === null) return { success: false, error: 'Cannot requeue a bye pairing' };
    if (pairing.status === 'pending_tiebreaker' || pairing.tiebreakerStatus === 'pending' || pairing.failureCode === 'UNRESOLVED_DRAW') {
      return { success: false, error: 'Pairing is waiting for organizer tiebreaker resolution, not a retryable execution failure' };
    }
    if (pairing.status !== 'failed' && pairing.status !== 'in_progress') {
      return { success: false, error: `Pairing cannot be requeued (current: ${pairing.status})` };
    }

    if (this.matchJobStore) {
      const job = await this.matchJobStore.get?.(tournamentId, pairingId);
      if (job?.status === 'running' && (!job.leaseExpiresAt || job.leaseExpiresAt > new Date().toISOString())) {
        return { success: false, error: 'Pairing has an active or indeterminate durable lease and cannot be requeued' };
      }
      if (this.matchJobStore.requeue && !(await this.matchJobStore.requeue(tournamentId, pairingId, 'Organizer requeue'))) {
        return { success: false, error: 'Pairing durable job is not safely requeueable' };
      }
    } else if (pairing.status === 'in_progress') {
      return { success: false, error: 'Cannot requeue an in-progress pairing without durable lease fencing' };
    }

    return this.mutateTournament(tournamentId, async tournament => {
      const fresh = this.findTournamentPairing(tournament, pairingId);
      if (!fresh) return { success: false, error: `Pairing ${pairingId} not found` };
      if (fresh.status !== 'failed' && fresh.status !== 'in_progress') {
        return { success: false, error: `Pairing changed before requeue (current: ${fresh.status})` };
      }
      if (fresh.status === 'in_progress' && this.matchJobStore === undefined) {
        return { success: false, error: 'Cannot requeue an in-progress pairing without durable lease fencing' };
      }
      // Preserve BO2/BO3 checkpoints, match artifacts and the old attempt.
      // The next execution resumes from the authoritative series progress.
      fresh.status = 'scheduled';
      fresh.failureReason = null;
      fresh.failureCode = null;
      await this.saveTournament(tournament);
      return { success: true, data: null };
    });
  }

  /**
   * A completed pairing cannot currently be rematched safely. The engine has
   * no immutable attempt history plus dependency-aware aggregate replacement,
   * so refusing is safer than overwriting standings or downstream slots.
   */
  async rematchPairing(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<null>> {
    const current = await this.loadTournament(tournamentId);
    if (!current.success || !current.data) return { success: false, error: current.error };
    const pairing = this.findTournamentPairing(current.data, pairingId);
    if (!pairing) return { success: false, error: `Pairing ${pairingId} not found` };
    if (pairing.status !== 'completed') return { success: false, error: `Rematch requires a completed pairing (current: ${pairing.status})` };
    return {
      success: false,
      error: 'Rematch is blocked: completed results feed standings or downstream rounds, and this engine has no safe immutable-attempt replacement policy yet',
    };
  }

  /** Retry one failed pairing without changing the rest of the schedule. */
  async preparePairingRetry(tournamentId: string, pairingId: string): Promise<TournamentOperationResult<null>> {
    const loadResult = await this.loadTournament(tournamentId);
    if (!loadResult.success || !loadResult.data) return { success: false, error: loadResult.error };
    const tournament = loadResult.data;
    if (tournament.status !== 'running' && tournament.status !== 'completed') {
      return { success: false, error: `Tournament cannot be rerun (status: ${tournament.status})` };
    }
    const pairing = this.findTournamentPairing(tournament, pairingId);
    if (!pairing) return { success: false, error: `Pairing ${pairingId} not found` };
    if (pairing.status === 'completed') {
      return { success: false, error: 'Completed pairing rerun requires an explicit attempt policy' };
    }
    if (pairing.status !== 'failed' && pairing.status !== 'pending_tiebreaker') {
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
    pairing.tiebreakerStatus = null;
    pairing.matchId = null;
    pairing.matchResult = null;
    pairing.startedAt = null;
    pairing.completedAt = null;
    pairing.seriesProgress = null;
    await this.saveTournament(tournament);
    return { success: true, data: null };
  }

  /**
   * Resolve an elimination tiebreaker where a match ended in a draw.
   */
  async resolveTiebreaker(
    tournamentId: string,
    pairingId: string,
    winner: 'A' | 'B',
    reason?: string,
    resolvedBy?: string
  ): Promise<TournamentOperationResult<Tournament>> {
    return this.mutateTournament(tournamentId, async tournament => {
      if (tournament.status !== 'running' && !(tournament.status === 'completed' && isMultiStageTournament(tournament))) {
        return { success: false, error: `Tournament is not running (status: ${tournament.status})` };
      }
      const pairing = this.findTournamentPairing(tournament, pairingId);
      if (!pairing) {
        return { success: false, error: `Pairing ${pairingId} not found` };
      }

      // Idempotency: if already resolved with the same winner, return cleanly
      if (pairing.status === 'completed' && pairing.tiebreakerStatus === 'resolved') {
        if (pairing.matchResult?.winner === winner) {
          return { success: true, data: tournament };
        }
        return { success: false, error: `Pairing ${pairingId} is already resolved with conflicting winner` };
      }

      if (pairing.status !== 'pending_tiebreaker' && pairing.failureCode !== 'UNRESOLVED_DRAW' && pairing.tiebreakerStatus !== 'pending') {
        return { success: false, error: `Pairing ${pairingId} is not in pending tiebreaker state (current status: ${pairing.status})` };
      }
      if (!pairing.matchResult) {
        return { success: false, error: `Pairing ${pairingId} has no recorded match result to resolve` };
      }

      const now = new Date().toISOString();
      const resolutionReason = reason ?? 'Tiebreaker resolved';
      const actor = resolvedBy ?? 'organizer';

      const matchId = pairing.matchId ?? pairing.matchResult.matchId ?? pairingId;
      // Update match result with decisive winner
      const updatedRecord: TournamentMatchRecord = {
        ...pairing.matchResult,
        matchId,
        replayRef: pairing.matchResult.replayRef ?? matchId,
        winner,
        completedAt: now,
      };

      // Persist updated match result in repository
      const replay = await this.repository.loadReplay(tournamentId, matchId);
      const updatedReplay = replay ? { ...replay, matchId, winner } : { matchId, winner };
      await this.repository.saveMatchResult(
        tournamentId,
        matchId,
        updatedRecord,
        updatedReplay
      );

      pairing.tiebreakerStatus = 'resolved';
      pairing.failureCode = null;
      pairing.failureReason = resolutionReason;
      pairing.tiebreakerResolution = {
        winner,
        resolvedBy: actor,
        resolvedAt: now,
        reason: resolutionReason,
      };
      pairing.status = 'scheduled';
      pairing.matchResult = null;

      // Record tiebreaker decision in durable tournament metadata audit
      const metadata = tournament.metadata ?? (tournament.metadata = {});
      const tiebreakerAudit = Array.isArray(metadata.tiebreakerAudit) ? (metadata.tiebreakerAudit as any[]) : [];
      tiebreakerAudit.push({
        pairingId,
        winner,
        resolvedBy: actor,
        resolvedAt: now,
        reason: resolutionReason,
      });
      metadata.tiebreakerAudit = tiebreakerAudit;

      // Commit match result and advance winner slot
      commitMatchResultAndResolveSlots(tournament, pairingId, updatedRecord);

      if (this.isTournamentFinished(tournament)) {
        tournament.status = 'completed';
        tournament.completedAt = now;
        const allMatchRecords = await this.repository.listMatchResults(tournamentId);
        tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);
      }

      await this.saveTournament(tournament);
      return { success: true, data: tournament };
    });
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
  private getPairingSeriesFormat(tournament: Tournament, pairing: TournamentPairing): 'bo1' | 'bo2' | 'bo3' {
    if (pairing.seriesProgress?.format) return pairing.seriesProgress.format;
    const configured = executionConfiguration(tournament).matchConfig.bestOf ?? 1;
    if (isMultiStageTournament(tournament)) {
      const stage = getCurrentStage(tournament);
      const stagePairing = getAllTournamentPairings(tournament).find(candidate => candidate.pairingId === pairing.pairingId);
      // Group Stage is fixed BO2; regional/preliminary and Knockout are fixed BO3.
      // Legacy multi-stage records retain their historical stage behavior.
      if (stagePairing?.stageId === 'stage-group' || stage?.stageId === 'stage-group') return 'bo2';
      if (stagePairing?.stageId === 'stage-preliminary' || stagePairing?.stageId === 'stage-knockout') return 'bo3';
    }
    return configured === 2 ? 'bo2' : configured === 3 ? 'bo3' : 'bo1';
  }

  private async runPairing(
    tournament: Tournament,
    pairing: TournamentPairing,
    signal?: AbortSignal,
    options?: { persistStart?: boolean; assertLease?: () => Promise<boolean> }
  ): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
      return { success: false, error: 'Tournament execution cancelled' };
    }
    const executionKey = `${tournament.tournamentId}:${pairing.pairingId}`;
    if (this.activePairingExecutions.has(executionKey)) {
      return { success: false, error: `Pairing ${pairing.pairingId} is already being executed` };
    }
    this.activePairingExecutions.add(executionKey);

    try {
      const participantA = tournament.participants.find(p => p.participantId === pairing.participantA);
      const participantB = tournament.participants.find(p => p.participantId === pairing.participantB!);

      if (!participantA || !participantB) {
        return { success: false, error: 'Participant not found' };
      }

      const seriesFormat = this.getPairingSeriesFormat(tournament, pairing);
      if (seriesFormat !== 'bo1') {
        return await this.runSeriesPairing(tournament, pairing, participantA, participantB, seriesFormat, signal, {
          assertLease: options?.assertLease,
        });
      }

      const matchId = createMatchId(tournament.tournamentId, pairing.pairingId);

      // Mark pairing as in progress
      if (!this.markPairingInProgress(tournament, pairing, matchId)) {
        return { success: false, error: `Pairing ${pairing.pairingId} is not available` };
      }

      // Persist ownership of the pairing before starting any external work.
      // If this fails, no Docker execution may begin for an untracked match.
      if (options?.persistStart !== false) {
        try {
          await this.saveTournament(tournament);
        } catch (error) {
          return { success: false, error: `Unable to persist match start: ${error}` };
        }
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
      const configured = executionConfiguration(tournament);
      const matchConfig: MatchConfig = {
          matchId,
        protocolVersion: configured.matchConfig.protocolVersion,
        maxTurns: configured.matchConfig.maxTurns,
        turnTimeoutMs: configured.matchConfig.turnTimeoutMs,
        maxStdoutBytes: configured.matchConfig.maxStdoutBytes,
        maxStderrBytes: configured.matchConfig.maxStderrBytes,
        failurePolicy: configured.matchConfig.failurePolicy,
        maxRetries: configured.matchConfig.maxRetries,
        logRequests: configured.matchConfig.logRequests,
        logResponses: configured.matchConfig.logResponses,
        logStates: configured.matchConfig.logStates,
        ruleModifiers: configured.ruleModifiers,
        resourceLimits: {
          maxMemoryBytes: configured.botLimits.memoryLimitMb * 1024 * 1024,
          maxCpuPercent: configured.botLimits.cpuLimit * 100,
          maxProcesses: configured.botLimits.maxProcesses,
          maxFileSizeBytes: configured.botLimits.maxSourceBytes,
        },
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
      if (options?.assertLease && !(await options.assertLease())) {
        return { success: false, error: `Pairing ${pairing.pairingId} lease expired` };
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
          this.notifyCloseWaiters();
        }
      }

      if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }

      const isElimination = this.isEliminationPairing(tournament, pairing);
      if (isElimination && matchResult.winner !== 'A' && matchResult.winner !== 'B') {
        pairing.status = 'pending_tiebreaker';
        pairing.failureCode = 'UNRESOLVED_DRAW';
        pairing.failureReason = 'Elimination match ended in a draw without a decisive winner; tiebreaker pending';
        pairing.tiebreakerStatus = 'pending';
        pairing.matchId = matchId;
        pairing.matchResult = tournamentMatchRecord;
        pairing.completedAt = tournamentMatchRecord.completedAt;
        const live = this.getLiveMatchSnapshot(tournament.tournamentId, matchId);
        if (live) this.publishLiveSnapshot(tournament.tournamentId, { ...live, status: 'finished', sequence: live.sequence + 1, updatedAt: new Date().toISOString() });
        await this.saveTournament(tournament);
        return { success: false, error: 'Elimination match ended in a draw without a decisive winner (tiebreaker pending)' };
      }

      // Mark pairing completed
      this.markPairingCompleted(tournament, pairing, tournamentMatchRecord);

      // Recompute standings from all recorded results (idempotent)
      if (!isMultiStageTournament(tournament) || this.isTournamentFinished(tournament)) {
        const allMatchRecords = await this.repository.listMatchResults(tournament.tournamentId);
        tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);
      }

      // Save updated tournament
      if (signal?.aborted || this.cancelledTournaments.has(tournament.tournamentId)) {
        return { success: false, error: 'Tournament execution cancelled' };
      }
      if (options?.assertLease && !(await options.assertLease())) {
        return { success: false, error: `Pairing ${pairing.pairingId} lease expired` };
      }
      await this.saveTournament(tournament);

      return {
        success: true,
        data: { matchResult, replay },
      };
    } finally {
      this.activePairingExecutions.delete(executionKey);
      this.notifyCloseWaiters();
    }
  }

  /** Execute a pairing as a durable BO2 or conditional BO3 series. */
  private async runSeriesPairing(
    tournament: Tournament,
    pairing: TournamentPairing,
    participantA: TournamentParticipant,
    participantB: TournamentParticipant,
    format: 'bo2' | 'bo3',
    signal?: AbortSignal,
    options: { claimed?: boolean; coordinatorCommit?: boolean; assertLease?: () => Promise<boolean> } = {},
  ): Promise<TournamentOperationResult<ExecutedMatchResult>> {
    const seriesMatchId = createMatchId(tournament.tournamentId, pairing.pairingId);
    const progress: TournamentSeriesProgress = pairing.seriesProgress ?? {
      format, bestOf: format === 'bo2' ? 2 : 3, seed: randomUUID(), nextGame: 1, winsA: 0, winsB: 0, games: [],
    };
    if (progress.format !== format || progress.bestOf !== (format === 'bo2' ? 2 : 3)) {
      return { success: false, error: `Pairing ${pairing.pairingId} has incompatible persisted series format` };
    }
    pairing.seriesProgress = progress;

    if (options.claimed) {
      if (pairing.status !== 'in_progress' || pairing.matchId !== seriesMatchId) {
        return { success: false, error: `Pairing ${pairing.pairingId} does not hold the durable series claim` };
      }
    } else {
      if (!this.markPairingInProgress(tournament, pairing, seriesMatchId)) {
        return { success: false, error: `Pairing ${pairing.pairingId} is not available` };
      }
      try {
        await this.saveTournament(tournament);
      } catch (error) {
        return { success: false, error: `Unable to persist series start: ${error}` };
      }
    }

    try {
      const totalGames = format === 'bo2' ? 2 : 3;
      for (let gameNumber = progress.nextGame; gameNumber <= totalGames; gameNumber++) {
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
        }

        if (!gameRecord) throw new Error(`Series game ${numberedGame} could not be recorded`);
        if (options.assertLease && !(await options.assertLease())) {
          return { success: false, error: `Pairing ${pairing.pairingId} lease expired` };
        }
        const checkpoint = await this.commitCoordinator.checkpointSeriesGame({
          tournamentId: tournament.tournamentId,
          pairingId: pairing.pairingId,
          gameRecord,
          replay,
          format,
        });
        Object.assign(progress, checkpoint.seriesProgress);
        pairing.seriesProgress = progress;
        pairing.status = checkpoint.pairing.status;
        pairing.matchId = checkpoint.pairing.matchId;

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

        // BO2 always plays both games. For the regional/elimination BO3,
        // the first two games decide the series unless their score is tied
        // (for example 1-0 after one win and one draw). Only then is Game 3
        // required.
        if (format === 'bo3' && numberedGame >= 2) {
          const firstTwoScore = seriesScore(progress.games.slice(0, 2), participantA.participantId, participantB.participantId);
          if (firstTwoScore.winsA !== firstTwoScore.winsB) break;
        }

        // Give spectators a clear transition window and avoid starting the
        // next game immediately after the previous game's result is saved.
        if (format === 'bo3' && executionConfiguration(tournament).matchConfig.bestOf === 3 && !isMultiStageTournament(tournament) && numberedGame < 3) {
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
          format, bestOf: format === 'bo2' ? 2 : 3, seed: progress.seed, winsA: score.winsA, winsB: score.winsB, winner,
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
        series: { format, bestOf: format === 'bo2' ? 2 : 3, seed: progress.seed, games, winsA: score.winsA, winsB: score.winsB, winner },
      };
      if (!options.coordinatorCommit) {
        await this.repository.saveMatchResult(tournament.tournamentId, seriesMatchId, aggregateRecord, seriesReplay);
      }

      const isElimination = this.isEliminationPairing(tournament, pairing);
      if (isElimination && winner !== 'A' && winner !== 'B') {
        if (options.coordinatorCommit) {
          await this.repository.saveMatchResult(tournament.tournamentId, seriesMatchId, aggregateRecord, seriesReplay);
          const drawCommit = await this.mutateTournament(tournament.tournamentId, async fresh => {
            const freshPairing = this.findTournamentPairing(fresh, pairing.pairingId);
            if (!freshPairing) return { success: false, error: `Pairing ${pairing.pairingId} is missing during draw recovery` };
            freshPairing.status = 'pending_tiebreaker';
            freshPairing.failureCode = 'UNRESOLVED_DRAW';
            freshPairing.failureReason = 'Elimination series ended in a draw without a decisive winner; tiebreaker pending';
            freshPairing.tiebreakerStatus = 'pending';
            freshPairing.matchId = seriesMatchId;
            freshPairing.matchResult = aggregateRecord;
            freshPairing.completedAt = aggregateRecord.completedAt;
            await this.saveTournament(fresh);
            return { success: false, error: 'Elimination series ended in a draw without a decisive winner (tiebreaker pending)' };
          });
          return { success: false, error: drawCommit.error ?? 'Elimination series ended in a draw without a decisive winner (tiebreaker pending)' };
        }
        pairing.status = 'pending_tiebreaker';
        pairing.failureCode = 'UNRESOLVED_DRAW';
        pairing.failureReason = 'Elimination series ended in a draw without a decisive winner; tiebreaker pending';
        pairing.tiebreakerStatus = 'pending';
        pairing.matchId = seriesMatchId;
        pairing.matchResult = aggregateRecord;
        pairing.completedAt = aggregateRecord.completedAt;
        await this.saveTournament(tournament);
        return { success: false, error: 'Elimination series ended in a draw without a decisive winner (tiebreaker pending)' };
      }

      if (options.coordinatorCommit) {
        if (options.assertLease && !(await options.assertLease())) {
          return { success: false, error: `Pairing ${pairing.pairingId} lease expired` };
        }
        const commit = await this.commitCoordinator.commitMatchResult({
          tournamentId: tournament.tournamentId,
          pairingId: pairing.pairingId,
          matchResult: aggregateRecord,
          replay: seriesReplay,
        });
        if (!commit.success) return { success: false, error: `Unable to commit series ${seriesMatchId}` };
      } else {
        this.markPairingCompleted(tournament, pairing, aggregateRecord);
        if (!isMultiStageTournament(tournament) || this.isTournamentFinished(tournament)) {
          const allMatchRecords = await this.repository.listMatchResults(tournament.tournamentId);
          tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);
        }
        await this.saveTournament(tournament);
      }

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
      const failure = classifyMatchExecutionFailure(error);
      console.error(`[tournament] series execution failed for ${seriesMatchId}`, error);
      if (options.claimed) {
        await this.commitCoordinator.releasePairingClaim({
          tournamentId: tournament.tournamentId,
          pairingId: pairing.pairingId,
          matchId: seriesMatchId,
        });
        const fresh = await this.repository.load(tournament.tournamentId);
        const failedPairing = fresh && this.findTournamentPairing(fresh, pairing.pairingId);
        if (fresh && failedPairing && failedPairing.status === 'scheduled') {
          failedPairing.status = 'failed';
          failedPairing.failureCode = failure.code;
          failedPairing.failureReason = failure.reason;
          await this.saveTournament(fresh);
        }
      } else {
        pairing.status = 'failed';
        pairing.failureCode = failure.code;
        pairing.failureReason = failure.reason;
        pairing.matchId = null;
        pairing.startedAt = null;
        await this.saveTournament(tournament);
      }
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
    const configured = executionConfiguration(tournament);
    const matchConfig: MatchConfig = {
      matchId: gameId,
      protocolVersion: configured.matchConfig.protocolVersion,
      maxTurns: configured.matchConfig.maxTurns,
      turnTimeoutMs: configured.matchConfig.turnTimeoutMs,
      maxStdoutBytes: configured.matchConfig.maxStdoutBytes,
      maxStderrBytes: configured.matchConfig.maxStderrBytes,
      failurePolicy: configured.matchConfig.failurePolicy,
      maxRetries: configured.matchConfig.maxRetries,
      logRequests: configured.matchConfig.logRequests,
      logResponses: configured.matchConfig.logResponses,
      logStates: configured.matchConfig.logStates,
      ruleModifiers: configured.ruleModifiers,
      resourceLimits: {
        maxMemoryBytes: configured.botLimits.memoryLimitMb * 1024 * 1024,
        maxCpuPercent: configured.botLimits.cpuLimit * 100,
        maxProcesses: configured.botLimits.maxProcesses,
        maxFileSizeBytes: configured.botLimits.maxSourceBytes,
      },
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

    if (tournament.status !== 'running' && !(tournament.status === 'completed' && isMultiStageTournament(tournament))) {
      return { success: false, error: `Cannot complete: tournament status is ${tournament.status}` };
    }

    if (!this.isTournamentFinished(tournament)) {
      return { success: false, error: 'Not all matches completed' };
    }

    tournament.status = 'completed';
    tournament.completedAt = new Date().toISOString();
    if (isMultiStageTournament(tournament)) {
      const allMatchRecords = await this.repository.listMatchResults(tournament.tournamentId);
      tournament.standings = computeStandings(tournament.participants, allMatchRecords, tournament.scoringConfig);
    }
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
      if (!tournament.completedAt || !this.isTournamentFinished(tournament)) {
        return { success: false, error: 'Tournament results are incomplete' };
      }

      const expectedPairings = this.getAllPairings(tournament)
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
          let seriesValid = false;
          if (record.series && replay?.series) {
            const replayGames = await Promise.all(replay.series.games.map(async (game, index) => {
              const gameMatchId = game.replay?.matchId ?? record.series?.games[index]?.matchId;
              const storedReplay = gameMatchId
                ? await this.repository.loadReplay(tournamentId, gameMatchId)
                : null;
              return { game, replay: game.replay ?? storedReplay };
            }));
            seriesValid = replay.series.format === record.series.format
              && replay.series.seed === record.series.seed
              && replay.series.winsA === record.series.winsA
              && replay.series.winsB === record.series.winsB
              && replay.series.winner === record.series.winner
              && replayGames.length === record.series.games.length
              && replayGames.every(({ game, replay: gameReplay }, index) => {
                const expected = record.series!.games[index];
                return Boolean(expected && gameReplay && game.gameNumber === expected.gameNumber &&
                  game.participantA === expected.participantA && game.participantB === expected.participantB &&
                  game.winner === expected.winner && game.winnerParticipantId === expected.winnerParticipantId &&
                  gameReplay.matchId === expected.matchId && gameReplay.winner === expected.winner &&
                  (gameReplay.finalState.winner === null || gameReplay.finalState.winner === gameReplay.winner));
              });
          }
          // A Bot forfeit has an official match winner, but the engine state
          // may correctly retain winner=null because no legal move ended the
          // board game. BO1 uses the historical checks; series additionally
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
    this.activeSchedulers.get(tournamentId)?.cancel('Tournament execution cancelled');
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
    const allPairings = tournament ? this.getAllPairings(tournament) : [];
    const pairing = allPairings.find(item => item.matchId === matchId)
      ?? allPairings.find(item => item.matchResult?.series?.games.some(game => game.matchId === matchId)
        || item.seriesProgress?.games.some(game => game.matchId === matchId));
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
    type ReplaySeriesGameWithId = NonNullable<MatchReplay['series']>['games'][number] & { matchId?: string };
    // A BO2/BO3 game is persisted as its own replay artifact.  That artifact
    // does not necessarily carry the aggregate series envelope, so recover the
    // envelope from the pairing when the request targets game 2/3 directly.
    const seriesSource = replay.series ?? pairing.matchResult?.series;
    const replaySeriesGames = (seriesSource?.games ?? []) as ReplaySeriesGameWithId[];
    const seriesGame = replaySeriesGames.find(game => game.matchId === matchId)
      ?? pairing.matchResult?.series?.games.find(game => game.matchId === matchId)
      ?? pairing.seriesProgress?.games.find(game => game.matchId === matchId);
    // The selected game may swap its temporary A/B sides. The replay header
    // and aggregate score must stay anchored to the pairing participants;
    // game-local sides are retained inside each game record for board colors.
    const participantA = pairing.participantA;
    const participantB = pairing.participantB;
    const enrichedSeriesGames = seriesSource
      ? await Promise.all(replaySeriesGames.map(async game => {
        // The aggregate is a presentation envelope. Prefer the durable game
        // artifact so a partial embedded replay cannot reach the viewer.
        const storedGameReplay = game.matchId
          ? await this.repository.loadReplay(tournamentId, game.matchId).catch(() => null)
          : null;
        const gameReplay = storedGameReplay ?? game.replay ?? replay;
        return {
          ...game,
          replay: gameReplay ? {
            ...gameReplay,
            participantIdentities: {
              A: identity(game.participantA),
              B: identity(game.participantB),
            },
          } : gameReplay,
        };
      }))
      : undefined;
    return {
      success: true,
      data: {
        ...replay,
        participantIdentities: {
          A: identity(participantA),
          B: identity(participantB),
        },
        ...(seriesSource && enrichedSeriesGames ? {
          series: {
            ...seriesSource,
            games: enrichedSeriesGames,
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
    return { success: true, data: getTournamentStats(tournament.participants, matchRecords, this.getAllPairings(tournament)) };
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
      if (targetStatus === 'registration_open') {
        const openedAt = new Date().toISOString();
        tournament.registrationOpenedAt = openedAt;
        tournament.schedule = {
          ...DEFAULT_TOURNAMENT_SCHEDULE,
          ...(tournament.schedule ?? {}),
          registrationOpensAt: tournament.schedule?.registrationOpensAt ?? openedAt,
        };
        tournament.rulesetSnapshot = tournament.rulesetSnapshot ?? createRulesetSnapshot(tournament, openedAt);
        tournament.registrationClosedReason = null;
      }
      if (targetStatus === 'registration_closed') {
        tournament.registrationClosedAt = tournament.registrationClosedAt ?? new Date().toISOString();
        tournament.registrationClosedReason = 'manual';
      }
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

    // Load all match results and reconcile durable pairing state
    const matchRecords = await this.repository.listMatchResults(tournamentId);
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
      const allPairings = this.getAllPairings(tournament);
      const hasInterruptedPairing = allPairings.some(pairing => pairing.status === 'in_progress');
      const matchRecords = await this.repository.listMatchResults(tournament.tournamentId);
      const pairingRecords = matchRecords.filter(record => !record.seriesGameOf);
      const pairingById = new Map(allPairings.map(pairing => [pairing.pairingId, pairing]));
      const hasUnappliedCommittedResult = pairingRecords.some(record => {
        const pairing = pairingById.get(record.pairingId);
        return pairing !== undefined && (
          pairing.status !== 'completed' || pairing.matchResult?.matchId !== record.matchId
        );
      });
      if (this.matchJobStore) {
        await this.matchJobStore.ensureForTournament(tournament.tournamentId, allPairings);
        await this.matchJobStore.reconcile(
          tournament.tournamentId,
          allPairings,
          pairingRecords.map(record => record.pairingId),
        );
      }
      // A series can have advanced the in-memory stage/tournament status before
      // the final snapshot save fails. Its durable result must still be
      // reconciled after restart even when that snapshot says "completed".
      if (tournament.status !== 'running' && !hasUnappliedCommittedResult) continue;
      if (!hasInterruptedPairing && !hasUnappliedCommittedResult) continue;
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
  /**
   * Reconcile durable pairing state with committed match results.
   *
   * A committed result is authoritative. An in-progress pairing without a
   * committed result belongs to an execution interrupted after its start was
   * persisted, so it becomes eligible again after the previous writer has
   * released storage ownership.
   *
   * Hardened multi-pass reconciliation resolves slots topologically regardless of
   * filesystem readdir record order, preserving downstream winner slots and detecting
   * conflicting or deadlock states.
   */
  private async reconcileInterruptedPairings(
    tournament: Tournament,
    matchRecords?: TournamentMatchRecord[]
  ): Promise<void> {
    const rawRecords = matchRecords ?? await this.repository.listMatchResults(tournament.tournamentId);
    // Series game checkpoints share the pairingId with the aggregate result,
    // but they must not complete the pairing or affect standings individually.
    // The aggregate record is the only pairing-level reconciliation record.
    const pairingRecords = rawRecords.filter(record => !record.seriesGameOf);
    const completedPairingIds = new Set(pairingRecords.map(record => record.pairingId));
    const allPairings = this.getAllPairings(tournament);
    const pairingMap = new Map<string, TournamentPairing>();
    for (const p of allPairings) {
      pairingMap.set(p.pairingId, p);
    }

    for (const pairing of allPairings) {
      if (pairing.status === 'in_progress' && !completedPairingIds.has(pairing.pairingId)) {
        pairing.status = 'scheduled';
        pairing.matchId = null;
        pairing.matchResult = null;
        pairing.startedAt = null;
        pairing.completedAt = null;
      }
    }

    if (pairingRecords.length === 0) return;

    // Helper: build stage topological index map
    const stageOrderMap = new Map<string, number>();
    if (isMultiStageTournament(tournament) && tournament.stages) {
      for (const stage of tournament.stages) {
        stageOrderMap.set(stage.stageId, stage.order);
      }
    }

    // Initial topological sort: Stage hierarchy -> Round hierarchy -> Timestamp
    const records = [...pairingRecords].sort((a, b) => {
      const foundA = findPairingInTournament(tournament, a.pairingId);
      const foundB = findPairingInTournament(tournament, b.pairingId);
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

    // Multi-pass reconciliation loop with progress detection
    let remaining = [...records];
    let pass = 0;
    const maxPasses = remaining.length + 1;

    while (remaining.length > 0 && pass < maxPasses) {
      pass++;
      let progress = false;
      const nextRemaining: TournamentMatchRecord[] = [];

      for (const record of remaining) {
        const pairing = pairingMap.get(record.pairingId);
        if (!pairing) {
          throw new Error(`Match record references unknown pairing: ${record.pairingId}`);
        }

        // Idempotency & Conflict Check on already-completed pairings
        if (pairing.status === 'completed' && pairing.matchResult) {
          if (
            pairing.matchResult.matchId === record.matchId &&
            pairing.matchResult.winner === record.winner
          ) {
            // Already committed identically - idempotent pass-through
            progress = true;
            continue;
          }
          throw new Error(
            `Pairing ${pairing.pairingId} is already completed with conflicting result (existing winner: ${pairing.matchResult.winner}, incoming: ${record.winner})`
          );
        }

        const isElimination = this.isEliminationPairing(tournament, pairing);

        if (isMultiStageTournament(tournament)) {
          // Check if pairing dependencies are satisfied before committing
          const isReady = this.isPairingReadyForReconcile(pairing);
          if (!isReady) {
            // Dependencies not yet resolved; defer to next pass
            nextRemaining.push(record);
            continue;
          }
        }

        // Handle elimination draw -> pending_tiebreaker
        if (isElimination && record.winner !== 'A' && record.winner !== 'B') {
          pairing.status = 'pending_tiebreaker';
          pairing.failureCode = 'UNRESOLVED_DRAW';
          pairing.failureReason = 'Elimination match ended in a draw without a decisive winner; tiebreaker pending';
          pairing.tiebreakerStatus = 'pending';
          pairing.matchId = record.matchId;
          pairing.matchResult = record;
          pairing.completedAt = record.completedAt;
          progress = true;
          continue;
        }

        if (isMultiStageTournament(tournament)) {
          commitMatchResultAndResolveSlots(tournament, record.pairingId, record);
          progress = true;
        } else {
          pairing.status = 'completed';
          pairing.matchId = record.matchId;
          pairing.matchResult = record;
          pairing.startedAt = record.completedAt;
          pairing.completedAt = record.completedAt;
          progress = true;
        }
      }

      remaining = nextRemaining;
      if (!progress && remaining.length > 0) {
        const unresolvable = remaining.map(r => r.pairingId).join(', ');
        throw new Error(
          `Tournament recovery deadlock: unable to reconcile ${remaining.length} match record(s) due to unresolvable slot dependencies: [${unresolvable}]`
        );
      }
    }

    if (!isMultiStageTournament(tournament) || this.isTournamentFinished(tournament)) {
      tournament.standings = computeStandings(tournament.participants, pairingRecords, tournament.scoringConfig);
    } else if (isMultiStageTournament(tournament)) {
      tournament.standings = [];
    }
  }

  private isEliminationPairing(tournament: Tournament, pairing: TournamentPairing): boolean {
    if (!isMultiStageTournament(tournament)) {
      return false;
    }
    const found = findPairingInTournament(tournament, pairing.pairingId);
    if (found?.stage?.stageType) {
      return found.stage.stageType === 'preliminary' || found.stage.stageType === 'knockout';
    }
    return pairing.stageId === 'stage-preliminary' || pairing.stageId === 'stage-knockout';
  }

  private isPairingReadyForReconcile(pairing: TournamentPairing): boolean {
    const aReady = Boolean(
      pairing.participantA &&
      !isSlotPlaceholder(pairing.participantA) &&
      (!pairing.slotA || pairing.slotA.participantId !== null)
    );
    const bReady =
      !pairing.participantB ||
      (!isSlotPlaceholder(pairing.participantB) && (!pairing.slotB || pairing.slotB.participantId !== null));
    return aReady && bReady;
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
  sourceRevisionExecutor?: SourceRevisionExecutor,
  enableMultiStage?: boolean,
  enableBo1MatchScheduler = false,
  onBo1SchedulerCheckpoint?: TournamentAppConfig['onBo1SchedulerCheckpoint'],
  qaMaxActiveMatches: 1 | 2 = 1,
  seriesMatchConcurrency: 1 | 2 = 1,
  enableSeriesConcurrency2 = false,
  validateTournamentRevisions?: (executions: SourceRevisionExecution[]) => Promise<{ valid: boolean; pending: boolean; error?: string }>,
): Promise<TournamentManager> {
  const repository = new FileTournamentRepository({ baseDir: storageDir });
  await repository.initialize();

  try {
    const effectiveExecutionPolicy = executionPolicy ?? (
      process.env.NODE_ENV?.trim().toLowerCase() === 'production' ? 'sandbox-required' : 'development'
    );
    const effectiveMultiStage = enableMultiStage ?? (
      process.env.ENABLE_MULTI_STAGE?.trim().toLowerCase() !== 'false'
    );
    let matchExecutor = executor;
    if (!matchExecutor) {
      let botExecutor: BotExecutor | undefined;
      const { createExecutor } = await import('@bot-executor/index.js');
      const explicitTestExecutor = !executorConfig?.type &&
        !executorConfig?.dockerConfig &&
        !executorConfig?.childProcessConfig &&
        effectiveExecutionPolicy === 'development' &&
        (process.env.NODE_ENV?.trim().toLowerCase() === 'test' || process.env.NODE_ENV?.trim().toLowerCase() === 'development')
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

    return new TournamentManager({
      repository,
      executor: matchExecutor,
      storageDir,
      validateSourceRevision,
      validateTournamentRevisions,
      resolveSourceRevision,
      sourceRevisionExecutor,
      enableMultiStage: effectiveMultiStage,
      enableBo1MatchScheduler,
      ...(qaMaxActiveMatches === 2 ? { qaMaxActiveMatches: 2 as const } : {}),
      seriesMatchConcurrency: qaMaxActiveMatches === 2 ? 2 : seriesMatchConcurrency,
      enableSeriesConcurrency2,
      onBo1SchedulerCheckpoint,
    });
  } catch (error) {
    repository.close();
    throw error;
  }
}

/**
 * Create a TournamentManager with mock executor for testing
 */
export function createMockTournamentManager(
  repository: TournamentRepository,
  config?: Partial<TournamentAppConfig>
): TournamentManager {
  return new TournamentManager({
    repository,
    executor: new MockMatchExecutor(),
    ...config,
  });
}
