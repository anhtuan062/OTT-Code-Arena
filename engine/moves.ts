/**
 * Move generation and validation
 */

import { GameState, Piece, Position, Player, PieceType, MoveOption, ValidationResult, CAPTURE_RULES, DIRECTIONS, BOARD_SIZE, RuleModifiers, DEFAULT_RULE_MODIFIERS } from './types.js';
import { getPieceById, getPieceAt, isInsideBoard, opponent } from './state.js';

export function canCapture(attackerType: PieceType, defenderType: PieceType): boolean {
  if (attackerType === defenderType) return false;
  return CAPTURE_RULES[attackerType] === defenderType;
}

export function generateLegalMovesForPiece(state: GameState, pieceId: string, _ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): MoveOption[] {
  const piece = getPieceById(state, pieceId);
  if (!piece) return [];

  const moves: MoveOption[] = [];
  const fromPos: Position = { row: piece.row, col: piece.col };

  for (const dir of DIRECTIONS) {
    const toRow = piece.row + dir.row;
    const toCol = piece.col + dir.col;
    const toPos: Position = { row: toRow, col: toCol };

    if (!isInsideBoard(toPos)) continue;

    const target = getPieceAt(state, toRow, toCol);
    if (!target) {
      // Empty square - valid move
      moves.push({
        pieceId,
        from: fromPos,
        to: toPos,
        captures: null,
      });
    } else if (target.player !== piece.player) {
      // Enemy piece - check capture rules
      if (target.type !== piece.type && canCapture(piece.type, target.type)) {
        moves.push({
          pieceId,
          from: fromPos,
          to: toPos,
          captures: target.id,
        });
      }
    }
    // Friendly piece or same type - not a valid move
  }

  return moves;
}

export function generateAllLegalMoves(state: GameState, ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): MoveOption[] {
  const playerPieces = state.pieces.filter(p => p.player === state.currentPlayer);
  const allMoves: MoveOption[] = [];
  for (const piece of playerPieces) {
    allMoves.push(...generateLegalMovesForPiece(state, piece.id, ruleModifiers));
  }
  return allMoves;
}

export function validateMove(state: GameState, pieceId: string, toRow: number, toCol: number, _ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): ValidationResult {
  const piece = getPieceById(state, pieceId);
  if (!piece) {
    return { valid: false, reason: 'Piece not found' };
  }

  if (state.status !== 'playing') {
    return { valid: false, reason: 'Game not in progress' };
  }

  if (piece.player !== state.currentPlayer) {
    return { valid: false, reason: 'Not your piece' };
  }

  if (!isInsideBoard({ row: toRow, col: toCol })) {
    return { valid: false, reason: 'Destination off board' };
  }

  const dr = Math.abs(toRow - piece.row);
  const dc = Math.abs(toCol - piece.col);
  if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) {
    return { valid: false, reason: 'Invalid move distance' };
  }

  const target = getPieceAt(state, toRow, toCol);
  if (target) {
    if (target.player === piece.player) {
      return { valid: false, reason: 'Cannot capture own piece' };
    }
    if (target.type === piece.type) {
      return { valid: false, reason: 'Cannot capture same type' };
    }
    if (!canCapture(piece.type, target.type)) {
      return { valid: false, reason: 'Piece cannot capture that type' };
    }
  }

  return { valid: true };
}

export function isMoveLegal(state: GameState, pieceId: string, toRow: number, toCol: number, ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): boolean {
  return validateMove(state, pieceId, toRow, toCol, ruleModifiers).valid;
}

export function findMoveOption(state: GameState, pieceId: string, toRow: number, toCol: number, ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): MoveOption | null {
  const moves = generateLegalMovesForPiece(state, pieceId, ruleModifiers);
  return moves.find(m => m.to.row === toRow && m.to.col === toCol) ?? null;
}
