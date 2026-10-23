/**
 * Match Runner - Types
 */

import type { GameState, GameConfig, InitialPieceConfig, MoveOption, ApplyResult, WinReason, Piece, RuleModifiers } from '@engine/types.js';
import type { BotProcessConfig } from '@bot-runner/types.js';
import type { BotRequest, BotResponse, BotMoveOption, BotPiece, BotError } from '@bot-protocol/types.js';
import type { BotFailureStage, ResourceLimits } from '@bot-executor/types.js';

export type Player = 'A' | 'B';
export type SourceRuntimeId = 'cpp' | 'python3';

/** Server-verified execution identity for a source-backed Bot. */
export interface SourceRevisionExecution {
  kind: 'source-revision';
  competitorId: string;
  botId: string;
  revisionId: string;
  runtimeId: SourceRuntimeId;
  sourceDigest: string;
  executionMode?: 'raw' | 'strategy';
  sdkVersion?: string;
  sdkDigest?: string;
}

/** Historical command Bot representation. Never infer this from source fields. */
export interface LegacyCommandExecution {
  kind: 'legacy-command';
  command: string;
  args: string[];
  env?: Record<string, string>;
}
export interface ExecutionProvenance {
  player: Player;
  competitorId: string;
  botId: string;
  revisionId: string;
  runtimeId: SourceRuntimeId;
  sourceDigest: string;
  executionMode?: 'raw' | 'strategy';
  sdkVersion?: string;
  sdkDigest?: string;
}

export interface ExecutionDiagnostic {
  player: Player;
  runtimeId: SourceRuntimeId | 'legacy';
  executionMode: 'raw' | 'strategy' | 'legacy';
  /** Bounded host-observed timing facts; absent on legacy persisted diagnostics. */
  imageReadinessMs?: number;
  compilationContainerMs?: number | null;
  runtimeContainerMs?: number | null;
  cleanupMs?: number;
  totalMs?: number;
  sdkVersion?: string;
  sdkDigest?: string;
  compilationBackend?: 'bind' | 'ephemeral-volume';
  compilerImageDigest?: string;
  compilerConfigDigest?: string;
  artifactDigest?: string;
  failureStage?: BotFailureStage;
  errorCode?: string;
  exitCode: number | null;
  outputProduced: boolean;
  engineAcceptedMove: boolean;
}
export type MatchStatus = 'pending' | 'in_progress' | 'finished' | 'error';

export type TerminationReason =
  | 'all_pieces_captured'
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
  /** Per-tournament source runtime limits, bounded by executor policy. */
  resourceLimits?: ResourceLimits;
  /** Immutable rules selected for this match; absent means standard. */
  ruleModifiers?: RuleModifiers;
  /** Optional deterministic opening layout for this match/game. */
  initialPieces?: InitialPieceConfig[];
}

export interface BotDefinition {
  botId: string;
  player: Player;
  /** Present only for historical command Bots; source Bots use execution. */
  command: string;
  args: string[];
  env?: Record<string, string>;
  execution?: SourceRevisionExecution | LegacyCommandExecution;
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
    player: Player;
    pieceId: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
    captures: string | null;
  };
  resultingState?: GameState;
  engineResult?: ApplyResult;
  error?: BotError;
  /** Safe execution facts for authorized diagnostics; excludes source and raw output. */
  executionDiagnostic?: ExecutionDiagnostic;
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
  ruleModifiers?: RuleModifiers;
  metadata?: Record<string, unknown> & { executionDiagnostics?: ExecutionDiagnostic[] };
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
  /** New replays record the immutable modifier set; legacy replays omit it and are Standard. */
  ruleModifiers?: RuleModifiers;
  metadata?: { sourceRevisions?: ExecutionProvenance[]; executionDiagnostics?: ExecutionDiagnostic[] };
  /** Authorized tournament projection; absent on legacy replay records. */
  participantIdentities?: {
    A?: ReplayParticipantIdentity;
    B?: ReplayParticipantIdentity;
  };
  /** Multi-game envelope; absent on historical BO1 replays. */
  series?: {
    format: 'bo3' | 'bo2';
    bestOf: 3 | 2;
    seed: string;
    winsA: number;
    winsB: number;
    winner: Player | 'draw';
    games: Array<{
      gameNumber: 1 | 2 | 3;
      participantA: string;
      participantB: string;
      winner: Player | 'draw' | null;
      winnerParticipantId: string | null;
      replay: MatchReplay;
    }>;
  };
}

export type LiveMatchStatus = 'in_progress' | 'finished' | 'failed' | 'cancelled';

export interface LiveMatchSnapshot {
  matchId: string;
  /** BO3 game represented by this snapshot; absent for legacy BO1 snapshots. */
  gameNumber?: 1 | 2 | 3;
  status: LiveMatchStatus;
  sequence: number;
  turn: number;
  currentPlayer: Player;
  state: GameState;
  latestMove: TurnLog['appliedMove'] | null;
  updatedAt: string;
  error?: string;
}

export interface ReplayParticipantIdentity {
  participantId: string;
  participantName: string;
  botId?: string;
  botName?: string;
  runtimeId?: SourceRuntimeId;
}

export interface MatchRunnerCallbacks {
  onTurnStart?: (turn: number, player: Player) => void;
  onTurnEnd?: (turnLog: TurnLog) => void;
  onSnapshot?: (snapshot: LiveMatchSnapshot) => void;
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

/**
 * Source revisions use the same minimum turn budget in matches and in
 * preflight.  The minimum is part of the existing match policy: it covers
 * Docker/runtime startup overhead without changing legacy-command behavior.
 */
export const SOURCE_REVISION_MIN_TURN_TIMEOUT_MS = 5_000;

export function sourceRevisionTurnTimeoutMs(turnTimeoutMs = DEFAULT_MATCH_CONFIG.turnTimeoutMs): number {
  return Math.max(turnTimeoutMs, SOURCE_REVISION_MIN_TURN_TIMEOUT_MS);
}
