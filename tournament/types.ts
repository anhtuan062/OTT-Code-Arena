/**
 * Tournament Manager - Type Definitions
 */

import { BotDefinition, MatchResult, MatchReplay, TerminationReason, Player, SourceRevisionExecution, LegacyCommandExecution, ExecutionDiagnostic } from '@match-runner/types.js';

export type { SourceRevisionExecution, LegacyCommandExecution } from '@match-runner/types.js';

export type { TerminationReason, Player };

/**
 * Tournament formats supported
 */
export type TournamentFormat = 'single_round_robin';

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

/**
 * Pairing status within a round
 */
export type PairingStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

/** Bounded, non-sensitive classification for an execution attempt failure. */
export type PairingFailureCode =
  | 'DOCKER_INFRASTRUCTURE'
  | 'SOURCE_REVISION'
  | 'PERSISTENCE'
  | 'EXECUTION';

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
export interface TournamentPairing {
  pairingId: string;
  roundNumber: number;
  participantA: string; // participantId
  participantB: string | null; // null = bye
  status: PairingStatus;
  matchId: string | null;
  matchResult: TournamentMatchRecord | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Safe-to-display classification for an execution attempt that needs retry. */
  failureReason?: string | null;
  /** Stable diagnostic category; never contains internal exception text. */
  failureCode?: PairingFailureCode | null;
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
}

/**
 * Scoring configuration
 */
export interface TournamentScoringConfig {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  byePoints?: number; // Points awarded for a bye (default: winPoints)
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

/**
 * Full tournament state
 */
export interface Tournament {
  tournamentId: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  participants: TournamentParticipant[];
  matchConfig: TournamentMatchConfig;
  scoringConfig: TournamentScoringConfig;
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
};

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORING_CONFIG: TournamentScoringConfig = {
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  byePoints: 3, // By default, bye = win
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
};

/**
 * Maximum participants (practical limit)
 */
export const MAX_PARTICIPANTS = 64;
