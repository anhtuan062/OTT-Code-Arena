/**
 * Match Runner - Main Entry Point
 */

export * from './types.js';
export * from './match.js';

import { MatchRunner, createMatchRunner } from './match.js';
import type { MatchConfig, BotDefinition, TurnLog, MatchResult, MatchReplay, MatchRunnerCallbacks, TerminationReason, Player } from './types.js';

export { MatchRunner, createMatchRunner };
export type { MatchConfig, BotDefinition, TurnLog, MatchResult, MatchReplay, MatchRunnerCallbacks, TerminationReason, Player };