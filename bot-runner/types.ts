/**
 * Bot Runner - Types
 */

export interface BotCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface BotProcessConfig {
  botId: string;
  command: BotCommand;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
}

export interface BotRequestMessage {
  protocol_version: string;
  match_id: string;
  turn: number;
  player: 'A' | 'B';
  board_size: number;
  pieces: Array<{
    id: string;
    type: 'dam' | 'la' | 'keo';
    player: 'A' | 'B';
    pos: string;
  }>;
  legal_moves: Array<{
    piece_id: string;
    from: string;
    to: string;
    captures: string | null;
  }>;
}

export interface BotResponseMessage {
  move: {
    piece_id: string;
    from: string;
    to: string;
  };
}

export interface BotResult {
  success: boolean;
  response?: BotResponseMessage;
  error?: BotError;
  exitCode?: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface BotError {
  code: string;
  message: string;
  details?: unknown;
}

export type BotFailurePolicy = 'forfeit' | 'skip_turn' | 'retry_once';

export interface BotRunnerConfig {
  defaultTimeoutMs: number;
  defaultMaxStdoutBytes: number;
  defaultMaxStderrBytes: number;
  failurePolicy: BotFailurePolicy;
  maxRetries: number;
}