/**
 * Tournament Manager - Type Definitions
 */

import { BotDefinition, MatchResult, MatchReplay, TerminationReason, Player } from '@match-runner/types.js';

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
  | 'cancelled'
  | 'skipped';

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
  command: string;
  args: string[];
  env?: Record<string, string>;
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
  registration_open: ['running', 'cancelled', 'draft'],
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