/**
 * Bot Protocol - Type Definitions
 * Version: 0.1.0
 */

export type ProtocolVersion = '0.1.0';
export const PROTOCOL_VERSION: ProtocolVersion = '0.1.0';

export type Player = 'A' | 'B';
export type PieceType = 'dam' | 'la' | 'keo';
export type GameStatus = 'playing' | 'finished';

export interface Position {
  row: number;  // 0-8
  col: number;  // 0-8
}

export interface BotPiece {
  id: string;
  type: PieceType;
  player: Player;
  pos: string;  // Algebraic notation (e.g., "c1")
}

export interface BotMoveOption {
  piece_id: string;
  from: string;
  to: string;
  captures: string | null;
}

export interface BotRequest {
  protocol_version: ProtocolVersion;
  match_id: string;
  turn: number;
  player: Player;
  board_size: number;
  pieces: BotPiece[];
  legal_moves: BotMoveOption[];
}

export interface BotMove {
  piece_id: string;
  from: string;
  to: string;
}

export interface BotResponse {
  move: BotMove;
}

export interface BotError {
  code: string;
  message: string;
  details?: unknown;
}

export type BotResponseOrError = BotResponse | BotError;

export function isBotResponse(obj: unknown): obj is BotResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const resp = obj as Record<string, unknown>;
  return (
    'move' in resp &&
    typeof resp.move === 'object' &&
    resp.move !== null &&
    typeof (resp.move as Record<string, unknown>).piece_id === 'string' &&
    typeof (resp.move as Record<string, unknown>).from === 'string' &&
    typeof (resp.move as Record<string, unknown>).to === 'string'
  );
}

export function isBotError(obj: unknown): obj is BotError {
  if (typeof obj !== 'object' || obj === null) return false;
  const err = obj as Record<string, unknown>;
  return (
    'code' in err &&
    typeof err.code === 'string' &&
    'message' in err &&
    typeof err.message === 'string'
  );
}