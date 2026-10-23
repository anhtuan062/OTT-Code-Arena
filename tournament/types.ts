/**
 * Tournament Manager - Type Definitions
 */

import { BotDefinition, MatchResult, MatchReplay, TerminationReason, Player, SourceRevisionExecution, LegacyCommandExecution, ExecutionDiagnostic } from '@match-runner/types.js';

export type { SourceRevisionExecution, LegacyCommandExecution } from '@match-runner/types.js';

export type { TerminationReason, Player };

/**
 * Tournament formats supported
 */
export type TournamentFormat = 'single_round_robin' | 'multi_stage';

/** Configuration policy for tournaments created by the current setup flow. */
export const CURRENT_TOURNAMENT_CONFIGURATION_VERSION = 2 as const;
export const NEW_TOURNAMENT_FORMAT: TournamentFormat = 'multi_stage';
export const NEW_TOURNAMENT_BEST_OF = 3 as const;
export const NEW_TOURNAMENT_TURN_TIMEOUT_MS = 5000;

/**
 * Tournament status lifecycle
 */
export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'running'
  | 'completed'
  | 'cancelled';

export type TournamentRegistrationClosedReason = 'manual' | 'scheduled';

/**
 * Pairing status within a round
 */
export type PairingStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'pending_tiebreaker';

/** Bounded, non-sensitive classification for an execution attempt failure. */
export type PairingFailureCode =
  | 'DOCKER_INFRASTRUCTURE'
  | 'SOURCE_REVISION'
  | 'PERSISTENCE'
  | 'EXECUTION'
  | 'TIMEOUT'
  | 'UNRESOLVED_DRAW';

/**
 * A participant in the tournament with their bot definition
 */
export interface TournamentParticipant {
  participantId: string;
  name: string;
  bot: BotDefinition;
  registeredAt: string; // ISO 8601
}

/**
 * Bot definition for tournament (extends BotDefinition with version info)
 */
export interface TournamentBot {
  botId: string;
  version?: string;
  /** Legacy fields remain readable for historical tournaments. */
  command: string;
  args: string[];
  env?: Record<string, string>;
  execution?: SourceRevisionExecution | LegacyCommandExecution;
}

export type ParticipationRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ParticipationRequest {
  requestId: string;
  competitorId: string;
  botId: string;
  participantName: string;
  status: ParticipationRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  /** Immutable request snapshot. Legacy requests may omit source fields. */
  botSnapshot: TournamentBot;
  revisionId?: string;
  runtimeId?: 'cpp' | 'python3';
  sourceDigest?: string;
  executionMode?: 'raw' | 'strategy';
  sdkVersion?: string;
  sdkDigest?: string;
}

/**
 * A single round in the tournament schedule
 */
export interface TournamentRound {
  roundNumber: number;
  pairings: TournamentPairing[];
}

/**
 * A pairing between two participants in a round
 */
export type SlotSourceType =
  | 'direct'
  | 'bye'
  | 'preliminary_winner'
  | 'regional_qualifier'
  | 'group_rank'
  | 'knockout_winner';

export interface PairingSlot {
  slotId: string;
  sourceType: SlotSourceType;
  /** Resolved participantId if determined, or null if waiting for prerequisite result */
  participantId: string | null;
  /** Human-readable label for display/planning (e.g. "P1-m1-winner", "1st-Group-A") */
  placeholder: string;
  /** Structural reference for the dependency */
  sourceRef?: {
    stageId?: string;
    regionId?: string;
    pairingId?: string;
    groupId?: string;
    rank?: number;
  };
}

export interface TiebreakerResolution {
  winner: 'A' | 'B';
  resolvedBy: string;
  resolvedAt: string;
  reason: string;
}

/**
 * A pairing between two participants in a round
 */
export interface TournamentPairing {
  pairingId: string;
  roundNumber: number;
  participantA: string; // participantId or slot placeholder
  participantB: string | null; // null = bye, or participantId/slot placeholder
  status: PairingStatus;
  matchId: string | null;
  matchResult: TournamentMatchRecord | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Safe-to-display classification for an execution attempt that needs retry. */
  failureReason?: string | null;
  /** Stable diagnostic category; never contains internal exception text. */
  failureCode?: PairingFailureCode | null;
  /** Tiebreaker status when elimination match ends in a draw */
  tiebreakerStatus?: 'pending' | 'resolved' | null;
  /** Details of manual or policy tiebreaker decision */
  tiebreakerResolution?: TiebreakerResolution | null;
  /** Durable multi-game progress. Absent on legacy BO1 pairings. */
  seriesProgress?: TournamentSeriesProgress | null;
  /** Multi-stage slot descriptor for participantA */
  slotA?: PairingSlot;
  /** Multi-stage slot descriptor for participantB (null if bye) */
  slotB?: PairingSlot | null;
  /** Stage identifier this pairing belongs to */
  stageId?: string;
  /** Region identifier this pairing belongs to (if within a region) */
  regionId?: string;
  /** Group identifier this pairing belongs to (if within a group) */
  groupId?: string;
}

export interface TournamentSeriesProgress {
  format: 'bo2' | 'bo3';
  bestOf: 2 | 3;
  seed: string;
  nextGame: 1 | 2 | 3;
  winsA: number;
  winsB: number;
  games: TournamentSeriesGameRecord[];
}

/**
 * Match result record stored in tournament (subset of MatchResult for persistence)
 */
export interface TournamentMatchRecord {
  matchId: string;
  pairingId: string;
  participantA: string;
  participantB: string | null;
  winner: Player | 'draw' | null;
  terminationReason: TerminationReason | null;
  turnCount: number;
  durationMs: number;
  replayRef: string; // Reference to stored replay
  completedAt: string;
  executionProvenance?: import('@match-runner/types.js').ExecutionProvenance[];
  executionDiagnostics?: ExecutionDiagnostic[];
  /** Present for a multi-game aggregate record; absent for historical BO1 records. */
  series?: TournamentSeriesRecord;
  /** Internal per-game artifact, excluded from standings aggregation. */
  seriesGameOf?: string;
}

export interface TournamentSeriesGameRecord {
  gameNumber: 1 | 2 | 3;
  matchId: string;
  participantA: string;
  participantB: string;
  winner: Player | 'draw' | null;
  winnerParticipantId: string | null;
  terminationReason: TerminationReason | null;
  turnCount: number;
  durationMs: number;
  replayRef: string;
  completedAt: string;
}

export interface TournamentSeriesRecord {
  format: 'bo2' | 'bo3';
  bestOf: 2 | 3;
  seed: string;
  games: TournamentSeriesGameRecord[];
  winsA: number;
  winsB: number;
  winner: Player | 'draw';
}

/**
 * Tournament configuration for matches
 */
export interface TournamentMatchConfig {
  protocolVersion: string;
  maxTurns: number;
  turnTimeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  failurePolicy: 'forfeit';
  maxRetries: number;
  logRequests: boolean;
  logResponses: boolean;
  logStates: boolean;
  /** Omitted means legacy BO1 unless a multi-stage policy selects a stage series. */
  bestOf?: 1 | 2 | 3;
}

/**
 * Scoring configuration
 */
export interface TournamentScoringConfig {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  byePoints?: number; // Deprecated; byes always award 0 points.
}

/** Planned publication and registration windows. Actual lifecycle timestamps remain separate. */
export interface TournamentScheduleConfig {
  visibleAt: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}

/** The only standard ruleset currently implemented by the engine. */
export interface TournamentRulesConfig {
  rulesetId: 'ott-standard';
  rulesetVersion: 1;
  /** Independent, engine-supported rule modifiers. Omitted legacy data means standard. */
  ruleModifiers?: Partial<TournamentRuleModifiers>;
}

export interface TournamentRuleModifiers {
  conversion: boolean;
}

/** Resource limits already enforced by the source-revision executor. */
export interface TournamentBotLimits {
  maxSourceBytes: number;
  memoryLimitMb: number;
  cpuLimit: number;
  maxProcesses: number;
  /** Maximum active/pending Bots one competitor may place in a new tournament. */
  maxBotsPerCompetitor?: number;
}

/** Immutable input snapshot for later scheduling/replay stages. */
export interface TournamentRulesetSnapshot {
  rulesetId: 'ott-standard';
  rulesetVersion: 1;
  snapshotHash: string;
  createdAt: string;
  format: TournamentFormat;
  matchConfig: TournamentMatchConfig;
  scoringConfig: TournamentScoringConfig;
  botLimits: TournamentBotLimits;
  ruleModifiers: TournamentRuleModifiers;
}

/**
 * Tournament standing for a participant
 */
export interface TournamentStanding {
  participantId: string;
  participantName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  forfeits: number; // matches won/lost by forfeit
  points: number;
  tiebreakHeadToHead: Record<string, number>; // participantId -> head-to-head points
}

export type StageType = 'preliminary' | 'group_stage' | 'knockout';

export type StageStatus = 'pending' | 'in_progress' | 'completed';

export interface TournamentGroup {
  groupId: string;
  name: string;
  groupIndex: number;
  participantIds: string[];
  rounds: TournamentRound[];
  standings: TournamentStanding[];
  status: StageStatus;
}

export interface TournamentRegion {
  regionId: string;
  name: string;
  regionIndex: number;
  participantIds: string[];
  rounds: TournamentRound[];
  advancingParticipantIds: string[];
  qualifierLimit?: number;
  qualifierCount: number;
  status: StageStatus;
}

export type AdvancementRuleType =
  | 'preliminary_elimination'
  | 'regional_qualifier'
  | 'group_top_n'
  | 'knockout_champion';

export interface StageAdvancement {
  ruleType: AdvancementRuleType;
  qualifiersPerGroup?: number;
  advancingCount: number;
  advancingParticipantIds: string[];
  isComplete: boolean;
}

export interface TournamentStage {
  stageId: string;
  stageType: StageType;
  name: string;
  order: number;
  status: StageStatus;
  rounds?: TournamentRound[];
  groups?: TournamentGroup[];
  regions?: TournamentRegion[];
  advancement: StageAdvancement;
}

export interface TournamentMultiStageView {
  tournamentId: string;
  isLegacy: boolean;
  stages: TournamentStage[];
  allPairings: TournamentPairing[];
  currentStage: TournamentStage | null;
  isComplete: boolean;
}

/**
 * Full tournament state
 */
export interface Tournament {
  tournamentId: string;
  name: string;
  format: TournamentFormat;
  /** Omitted on legacy records; current-created tournaments are version 2. */
  configurationVersion?: typeof CURRENT_TOURNAMENT_CONFIGURATION_VERSION;
  status: TournamentStatus;
  participants: TournamentParticipant[];
  matchConfig: TournamentMatchConfig;
  scoringConfig: TournamentScoringConfig;
  schedule: TournamentScheduleConfig;
  /** Why registration is closed; legacy tournaments may omit this field. */
  registrationClosedReason?: TournamentRegistrationClosedReason | null;
  rulesConfig: TournamentRulesConfig;
  botLimits: TournamentBotLimits;
  /** Set exactly once when registration opens; never edited afterwards. */
  rulesetSnapshot?: TournamentRulesetSnapshot | null;
  rounds: TournamentRound[];
  standings: TournamentStanding[];
  createdAt: string;
  registrationOpenedAt: string | null;
  registrationClosedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Null means results have not been explicitly published. */
  resultsPublishedAt?: string | null;
  participationRequests?: ParticipationRequest[];
  metadata?: Record<string, unknown>;
  /** Optional tournament description (goals, overview) */
  description?: string;
  /** Organizer organization name or public info */
  organizerInfo?: string;
  /** Public contact info for participants */
  contactInfo?: string;
  /** Organizer custom rule clarifications or notes */
  rulesNotes?: string;
  /** Organizer custom participation policy notes */
  policyNotes?: string;
  /**
   * Multi-stage tournament root data source (new tournaments).
   * Legacy tournaments omit this field and use rounds directly.
   */
  stages?: TournamentStage[];
  /** Whether stage advancement requires explicit organizer activation ('manual') or advances automatically. */
  stageGating?: 'manual' | 'auto';
}

export interface TournamentUpdateDetails {
  name?: string;
  description?: string;
  organizerInfo?: string;
  contactInfo?: string;
  rulesNotes?: string;
  policyNotes?: string;
  schedule?: Partial<TournamentScheduleConfig>;
  format?: TournamentFormat;
  matchConfig?: Partial<TournamentMatchConfig>;
  scoringConfig?: Partial<TournamentScoringConfig>;
  rulesConfig?: Partial<TournamentRulesConfig>;
  botLimits?: Partial<TournamentBotLimits>;
}

/**
 * Default tournament match configuration
 */
export const DEFAULT_TOURNAMENT_MATCH_CONFIG: TournamentMatchConfig = {
  protocolVersion: '0.1.0',
  maxTurns: 200,
  turnTimeoutMs: 2000,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 10 * 1024 * 1024,
  failurePolicy: 'forfeit',
  maxRetries: 0,
  logRequests: true,
  logResponses: true,
  logStates: false,
  // Library-created fixtures remain BO1 unless the production API opts into
  // the new series format explicitly. Persisted tournaments without this
  // field are therefore safely treated as historical BO1 records.
  bestOf: 1,
};

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: TournamentScoringConfig = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 0, // A bye advances without awarding points.
};

/** New multi-stage tournaments use one fixed standings policy. */
export const NEW_TOURNAMENT_SCORING_CONFIG: TournamentScoringConfig = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 0,
};

export const DEFAULT_TOURNAMENT_SCHEDULE: TournamentScheduleConfig = {
  visibleAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
};

export const DEFAULT_TOURNAMENT_RULES: TournamentRulesConfig = {
  rulesetId: 'ott-standard',
  rulesetVersion: 1,
  ruleModifiers: { conversion: false },
};

export const DEFAULT_TOURNAMENT_BOT_LIMITS: TournamentBotLimits = {
  maxSourceBytes: 64 * 1024,
  memoryLimitMb: 256,
  cpuLimit: 1,
  maxProcesses: 64,
  maxBotsPerCompetitor: 1,
};

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['registration_open', 'cancelled'],
  registration_open: ['registration_closed', 'running', 'cancelled', 'draft'],
  registration_closed: ['running', 'cancelled', 'draft'],
  running: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['draft'],
};

/**
 * Minimum participants for each format
 */
export const MIN_PARTICIPANTS: Record<TournamentFormat, number> = {
  single_round_robin: 2,
  multi_stage: 2,
};

/**
 * Maximum participants (legacy default limit)
 */
export const MAX_PARTICIPANTS = 64;

/**
 * Maximum participants by tournament format:
 * - single_round_robin: 64 (hard limit to preserve O(N^2) scheduling and match count sanity)
 * - multi_stage: 4096 (Regional Qualifiers -> Group Stage -> Knockout)
 */
export const MAX_PARTICIPANTS_BY_FORMAT: Record<TournamentFormat, number> = {
  single_round_robin: 64,
  multi_stage: 4096,
};

export function getMaxParticipants(format?: TournamentFormat): number {
  if (!format) return MAX_PARTICIPANTS;
  return MAX_PARTICIPANTS_BY_FORMAT[format] ?? MAX_PARTICIPANTS;
}

