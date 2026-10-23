/**
 * Move generation and validation
 */

import { GameState, Piece, Position, Player, PieceType, MoveOption, ValidationResult, CAPTURE_RULES, DIRECTIONS, BOARD_SIZE, RuleModifiers, DEFAULT_RULE_MODIFIERS } from './types.js';
import { getPieceById, getPieceAt, isInsideBoard, isGoalSquare, opponent } from './state.js';

export function canCapture(attackerType: PieceType, defenderType: PieceType): boolean {
  if (attackerType === defenderType) return false;
  return CAPTURE_RULES[attackerType] === defenderType;
}

/**
 * Selects a deterministic landing square for a converted piece.
 *
 * Candidates are searched by Chebyshev distance from the captured square and
 * then clockwise from the top direction. Goal squares and occupied squares
 * are excluded so Conversion never injects a piece into a scoring square or
 * relies on random placement.
 */
export function findConversionDestination(state: GameState, from: Position, to: Position): Position | null {
  const occupied = new Set(state.pieces.map(piece => `${piece.row}:${piece.col}`));
  const maxDistance = Math.max(1, state.boardSize - 1);
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const candidates: Position[] = [];
    for (let row = to.row - distance; row <= to.row + distance; row += 1) {
      for (let col = to.col - distance; col <= to.col + distance; col += 1) {
        if (Math.max(Math.abs(row - to.row), Math.abs(col - to.col)) !== distance) continue;
        candidates.push({ row, col });
      }
    }
    candidates.sort((a, b) => {
      const angle = (position: Position) => {
        const radians = Math.atan2(position.col - to.col, to.row - position.row);
        return radians < 0 ? radians + Math.PI * 2 : radians;
      };
      return angle(a) - angle(b) || a.row - b.row || a.col - b.col;
    });
    const destination = candidates.find(candidate =>
      isInsideBoard(candidate, state.boardSize)
      && !isGoalSquare(candidate)
      && !(candidate.row === from.row && candidate.col === from.col)
      && !occupied.has(`${candidate.row}:${candidate.col}`)
    );
    if (destination) return destination;
  }
  return null;
}

export function generateLegalMovesForPiece(state: GameState, pieceId: string, ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): MoveOption[] {
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
      if (target.type !== piece.type && canCapture(piece.type, target.type)
        && (!ruleModifiers.conversion || findConversionDestination(state, fromPos, toPos))) {
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

export function validateMove(state: GameState, pieceId: string, toRow: number, toCol: number, ruleModifiers: RuleModifiers = DEFAULT_RULE_MODIFIERS): ValidationResult {
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
    if (ruleModifiers.conversion && !findConversionDestination(state, { row: piece.row, col: piece.col }, { row: toRow, col: toCol })) {
      return { valid: false, reason: 'No legal square for converted piece' };
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
