/**
 * Tournament Manager - Main Entry Point
 */

export * from './types.js';
export * from './scheduling.js';
export * from './scoring.js';
export * from './executor.js';
export * from './persistence.js';
export * from './manager.js';
export * from './auto-format.js';
export * from './multi-stage.js';

import { TournamentManager, createTournamentManager, createMockTournamentManager } from './manager.js';
import type { TournamentAppConfig } from './manager.js';
import type { TournamentRepository, FileTournamentRepository, TournamentStorageConfig } from './persistence.js';
import type { MatchExecutor, MockMatchExecutor, MatchRunnerExecutor } from './executor.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentBot,
  TournamentRound,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
  TournamentMatchConfig,
  TournamentScoringConfig,
  TerminationReason,
  Player,
} from './types.js';

// Re-export constants
import {
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
  VALID_STATUS_TRANSITIONS,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MAX_PARTICIPANTS_BY_FORMAT,
  getMaxParticipants,
} from './types.js';

export {
  TournamentManager,
  createTournamentManager,
  createMockTournamentManager,
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
  VALID_STATUS_TRANSITIONS,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  MAX_PARTICIPANTS_BY_FORMAT,
  getMaxParticipants,
};

export type {
  TournamentAppConfig,
  TournamentRepository,
  FileTournamentRepository,
  TournamentStorageConfig,
  MatchExecutor,
  MockMatchExecutor,
  MatchRunnerExecutor,
  Tournament,
  TournamentParticipant,
  TournamentBot,
  TournamentRound,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
  TournamentMatchConfig,
  TournamentScoringConfig,
  TerminationReason,
  Player,
};