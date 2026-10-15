/**
 * Move application - immutable state transitions
 */

import type {
  GameState,
  Piece,
  Position,
  Player,
  MoveOption,
  ApplyResult,
  WinReason,
} from './types.js';
import { cloneState, getPieceById, getPieceAt, getPlayerPieces, opponent, isPlayerGoalSquare } from './state.js';
import { validateMove } from './moves.js';

function checkAllPiecesCaptured(state: GameState, player: Player): WinReason | null {
  return getPlayerPieces(state, player).length === 0 ? 'all_pieces_captured' : null;
}

function checkGoalSquare(pos: Position, player: Player): WinReason | null {
  if (isPlayerGoalSquare(pos, player)) {
    return 'goal_reached';
  }
  return null;
}

export function applyMove(state: GameState, move: MoveOption): ApplyResult {
  // Validate first
  const validation = validateMove(state, move.pieceId, move.to.row, move.to.col);
  if (!validation.valid) {
    return {
      success: false,
      state,
      capturedPiece: null,
      winReason: null,
    };
  }

  // Clone state for immutability
  const newState = cloneState(state);
  const piece = getPieceById(newState, move.pieceId)!;
  const fromPos: Position = { row: piece.row, col: piece.col };

  // Handle capture
  let capturedPiece: Piece | null = null;
  if (move.captures) {
    const capturedIdx = newState.pieces.findIndex(p => p.id === move.captures);
    if (capturedIdx >= 0) {
      const captured = newState.pieces[capturedIdx];
      if (captured) {
        capturedPiece = { id: captured.id, type: captured.type, player: captured.player, row: captured.row, col: captured.col };
      }
      newState.pieces.splice(capturedIdx, 1);
    }
  }

  // Move piece
  piece.row = move.to.row;
  piece.col = move.to.col;

  // Record move
  newState.lastMove = {
    pieceId: move.pieceId,
    from: fromPos,
    to: move.to,
    captures: move.captures,
    player: piece.player,
    turn: newState.turn,
  };

  // Check win conditions
  const opponentPlayer = opponent(piece.player);
  let winReason: WinReason | null = null;

  // A player wins by capturing every opposing piece, not merely one type.
  winReason = checkAllPiecesCaptured(newState, opponentPlayer);

  // Check goal square
  if (!winReason) {
    winReason = checkGoalSquare(move.to, piece.player);
  }

  if (winReason) {
    newState.status = 'finished';
    newState.winner = piece.player;
    newState.winReason = winReason;
  } else {
    // Switch turn
    newState.currentPlayer = opponentPlayer;
    newState.turn++;
  }

  return {
    success: true,
    state: newState,
    capturedPiece,
    winReason,
  };
}

export function applyMoveByCoords(state: GameState, pieceId: string, toRow: number, toCol: number): ApplyResult {
  const moveOption = findMoveOptionForCoords(state, pieceId, toRow, toCol);
  if (!moveOption) {
    return {
      success: false,
      state,
      capturedPiece: null,
      winReason: null,
    };
  }
  return applyMove(state, moveOption);
}

function findMoveOptionForCoords(state: GameState, pieceId: string, toRow: number, toCol: number): MoveOption | null {
  const piece = getPieceById(state, pieceId);
  if (!piece) return null;

  const target = getPieceAt(state, toRow, toCol);
  const captures = target && target.player !== piece.player && target.type !== piece.type
    ? target.id
    : null;

  return {
    pieceId,
    from: { row: piece.row, col: piece.col },
    to: { row: toRow, col: toCol },
    captures,
  };
}
