/**
 * Core type definitions for OTTv2 Game Engine
 */

export type Player = 'A' | 'B';
export type PieceType = 'dam' | 'la' | 'keo';
export type GameStatus = 'playing' | 'finished';
export type WinReason = 'type_elimination' | 'goal_reached';

export const BOARD_SIZE = 9;
export const COLS = 'abcdefghi' as const;
export type ColChar = typeof COLS[number];

export const PIECE_TYPES: readonly PieceType[] = ['dam', 'la', 'keo'] as const;

export const CAPTURE_RULES: Record<PieceType, PieceType> = {
  dam: 'keo',  // Rock beats Scissors
  keo: 'la',   // Scissors beats Paper
  la: 'dam',   // Paper beats Rock
} as const;

export interface Position {
  row: number;  // 0-8
  col: number;  // 0-8
}

export interface Piece {
  id: string;
  type: PieceType;
  player: Player;
  row: number;
  col: number;
}

export interface GameState {
  boardSize: number;
  currentPlayer: Player;
  turn: number;
  pieces: Piece[];
  status: GameStatus;
  winner: Player | null;
  winReason: WinReason | null;
  lastMove: MoveRecord | null;
}

export interface MoveRecord {
  pieceId: string;
  from: Position;
  to: Position;
  captures: string | null;
  player: Player;
  turn: number;
}

export interface MoveOption {
  pieceId: string;
  from: Position;
  to: Position;
  captures: string | null;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ApplyResult {
  success: boolean;
  state: GameState;
  capturedPiece: Piece | null;
  winReason: WinReason | null;
}

export interface GameConfig {
  boardSize: number;
  maxTurns: number;
  turnTimeoutMs: number;
  initialPieces: InitialPieceConfig[];
}

export interface InitialPieceConfig {
  type: PieceType;
  player: Player;
  row: number;
  col: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: BOARD_SIZE,
  maxTurns: 200,
  turnTimeoutMs: 2000,
  initialPieces: [
    // Player A (top)
    { type: 'dam', player: 'A', row: 0, col: 2 },
    { type: 'dam', player: 'A', row: 1, col: 6 },
    { type: 'dam', player: 'A', row: 2, col: 7 },
    { type: 'la', player: 'A', row: 0, col: 5 },
    { type: 'la', player: 'A', row: 1, col: 8 },
    { type: 'la', player: 'A', row: 2, col: 1 },
    { type: 'keo', player: 'A', row: 0, col: 8 },
    { type: 'keo', player: 'A', row: 1, col: 3 },
    { type: 'keo', player: 'A', row: 2, col: 4 },
    // Player B (bottom)
    { type: 'dam', player: 'B', row: 8, col: 6 },
    { type: 'dam', player: 'B', row: 7, col: 2 },
    { type: 'dam', player: 'B', row: 6, col: 1 },
    { type: 'la', player: 'B', row: 8, col: 3 },
    { type: 'la', player: 'B', row: 7, col: 0 },
    { type: 'la', player: 'B', row: 6, col: 7 },
    { type: 'keo', player: 'B', row: 8, col: 0 },
    { type: 'keo', player: 'B', row: 7, col: 5 },
    { type: 'keo', player: 'B', row: 6, col: 4 },
  ],
};

export const GOAL_SQUARES: Position[] = [
  { row: 0, col: 0 },  // a1
  { row: 8, col: 8 },  // i9
];

export const DIRECTIONS: Position[] = [
  { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
  { row:  0, col: -1 },                       { row:  0, col: 1 },
  { row:  1, col: -1 }, { row:  1, col: 0 }, { row:  1, col: 1 },
];