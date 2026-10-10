/**
 * Game state management - immutable state operations
 */

import { GameState, Piece, Position, Player, GameConfig, DEFAULT_CONFIG, GOAL_SQUARES, BOARD_SIZE, PIECE_TYPES, PieceType, ValidationResult } from './types.js';

export { GOAL_SQUARES } from './types.js';

export function createInitialState(config: GameConfig = DEFAULT_CONFIG): GameState {
  const pieces: Piece[] = [];
  let counters: Record<PieceType, Record<Player, number>> = {
    dam: { A: 0, B: 0 },
    la: { A: 0, B: 0 },
    keo: { A: 0, B: 0 },
  };

  for (const init of config.initialPieces) {
    counters[init.type][init.player]++;
    pieces.push({
      id: `${init.player}-${init.type}-${counters[init.type][init.player]}`,
      type: init.type,
      player: init.player,
      row: init.row,
      col: init.col,
    });
  }

  return {
    boardSize: config.boardSize,
    currentPlayer: 'A',
    turn: 1,
    pieces,
    status: 'playing',
    winner: null,
    winReason: null,
    lastMove: null,
  };
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    pieces: state.pieces.map(p => ({ ...p })),
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

export function getPieceAt(state: GameState, row: number, col: number): Piece | null {
  return state.pieces.find(p => p.row === row && p.col === col) ?? null;
}

export function getPieceById(state: GameState, pieceId: string): Piece | null {
  return state.pieces.find(p => p.id === pieceId) ?? null;
}

export function getPlayerPieces(state: GameState, player: Player): Piece[] {
  return state.pieces.filter(p => p.player === player);
}

export function getPieceTypesForPlayer(state: GameState, player: Player): Set<PieceType> {
  const types = new Set<PieceType>();
  for (const piece of state.pieces) {
    if (piece.player === player) {
      types.add(piece.type);
    }
  }
  return types;
}

export function countPlayerPiecesByType(state: GameState, player: Player): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { dam: 0, la: 0, keo: 0 };
  for (const piece of state.pieces) {
    if (piece.player === player) {
      counts[piece.type]++;
    }
  }
  return counts;
}

export function isInsideBoard(pos: Position, boardSize: number = BOARD_SIZE): boolean {
  return pos.row >= 0 && pos.row < boardSize && pos.col >= 0 && pos.col < boardSize;
}

export function isGoalSquare(pos: Position): boolean {
  return GOAL_SQUARES.some(g => g.row === pos.row && g.col === pos.col);
}

export function algebraicToPos(alg: string): Position | null {
  if (alg.length !== 2) return null;
  const colChar = alg.charAt(0).toLowerCase();
  const rowChar = alg.charAt(1);
  const col = 'abcdefghi'.indexOf(colChar);
  const row = parseInt(rowChar, 10) - 1;
  if (col < 0 || col >= 9 || row < 0 || row >= 9) return null;
  return { row, col };
}

export function algebraicToPosSafe(alg: string): Position {
  const pos = algebraicToPos(alg);
  if (!pos) throw new Error(`Invalid algebraic notation: ${alg}`);
  return pos;
}

export function posToAlgebraic(pos: Position): string {
  const col = 'abcdefghi'[pos.col];
  const row = pos.row + 1;
  return `${col}${row}`;
}

export function opponent(player: Player): Player {
  return player === 'A' ? 'B' : 'A';
}

export function validateState(state: GameState): ValidationResult {
  // Check board size
  if (state.boardSize !== BOARD_SIZE) {
    return { valid: false, reason: `Invalid board size: ${state.boardSize}` };
  }

  // Check pieces on board
  const occupied = new Map<string, Piece>();
  for (const piece of state.pieces) {
    // Check bounds
    if (!isInsideBoard({ row: piece.row, col: piece.col }, state.boardSize)) {
      return { valid: false, reason: `Piece ${piece.id} off board` };
    }
    // Check duplicates
    const key = `${piece.row},${piece.col}`;
    if (occupied.has(key)) {
      return { valid: false, reason: `Duplicate piece at ${key}` };
    }
    occupied.set(key, piece);
  }

  // Check piece IDs unique
  const ids = new Set(state.pieces.map(p => p.id));
  if (ids.size !== state.pieces.length) {
    return { valid: false, reason: 'Duplicate piece IDs' };
  }

  // Check turn positive
  if (state.turn < 1) {
    return { valid: false, reason: 'Invalid turn number' };
  }

  // Check current player valid
  if (state.currentPlayer !== 'A' && state.currentPlayer !== 'B') {
    return { valid: false, reason: 'Invalid current player' };
  }

  // Check status consistency
  if (state.status === 'finished') {
    if (!state.winner || !state.winReason) {
      return { valid: false, reason: 'Finished game missing winner/reason' };
    }
  } else {
    if (state.winner || state.winReason) {
      return { valid: false, reason: 'Playing game has winner/reason' };
    }
  }

  return { valid: true };
}