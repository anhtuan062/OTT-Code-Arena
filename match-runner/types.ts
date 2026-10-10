/**
 * Match Runner - Types
 */

import type { GameState, GameConfig, MoveOption, ApplyResult, WinReason, Piece } from '@engine/types.js';
import type { BotProcessConfig } from '@bot-runner/types.js';
import type { BotRequest, BotResponse, BotMoveOption, BotPiece, BotError } from '@bot-protocol/types.js';

export type Player = 'A' | 'B';
export type MatchStatus = 'pending' | 'in_progress' | 'finished' | 'error';

export type TerminationReason =
  | 'type_elimination'
  | 'goal_reached'
  | 'turn_limit'
  | 'repetition'
  | 'insufficient_material'
  | 'bot_timeout'
  | 'bot_crash'
  | 'bot_invalid_json'
  | 'bot_invalid_response'
  | 'bot_illegal_move'
  | 'bot_empty_output'
  | 'engine_error'
  | 'unknown';

export interface MatchConfig {
  matchId: string;
  protocolVersion: string;
  maxTurns: number;
  turnTimeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  failurePolicy: 'forfeit' | 'skip_turn' | 'retry_once';
  maxRetries: number;
  logRequests: boolean;
  logResponses: boolean;
  logStates: boolean;
}

export interface BotDefinition {
  botId: string;
  player: Player;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface TurnLog {
  turn: number;
  player: Player;
  timestamp: string;
  request?: BotRequest;
  response?: {
    success: boolean;
    response?: BotResponse;
    error?: BotError;
    exitCode?: number | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    durationMs: number;
  };
  appliedMove?: {
    pieceId: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
    captures: string | null;
  };
  resultingState?: GameState;
  engineResult?: ApplyResult;
  error?: BotError;
}

export interface MatchResult {
  matchId: string;
  protocolVersion: string;
  status: MatchStatus;
  winner: Player | 'draw' | null;
  terminationReason: TerminationReason | null;
  turnCount: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  playerA: BotDefinition;
  playerB: BotDefinition;
  finalState: GameState;
  initialState: GameState;
  turnLog: TurnLog[];
  metadata?: Record<string, unknown>;
}

export interface MatchReplay {
  matchId: string;
  protocolVersion: string;
  initialState: GameState;
  moves: Array<{
    turn: number;
    player: Player;
    pieceId: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
    captures: string | null;
    timestamp: string;
  }>;
  finalState: GameState;
  winner: Player | 'draw' | null;
  terminationReason: TerminationReason | null;
}

export interface MatchRunnerCallbacks {
  onTurnStart?: (turn: number, player: Player) => void;
  onTurnEnd?: (turnLog: TurnLog) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onError?: (error: Error) => void;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  matchId: '',
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