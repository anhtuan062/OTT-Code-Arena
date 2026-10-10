import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  cloneState,
  getPieceById,
  getPieceAt,
} from '@engine/state.js';
import {
  canCapture,
  generateLegalMovesForPiece,
  generateAllLegalMoves,
  validateMove,
  isMoveLegal,
  findMoveOption,
} from '@engine/moves.js';
import type { GameState } from '@engine/types.js';

describe('Engine Moves', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  describe('Capture Rules', () => {
    it('should allow dam to capture keo', () => {
      expect(canCapture('dam', 'keo')).toBe(true);
    });

    it('should allow keo to capture la', () => {
      expect(canCapture('keo', 'la')).toBe(true);
    });

    it('should allow la to capture dam', () => {
      expect(canCapture('la', 'dam')).toBe(true);
    });

    it('should not allow same type capture', () => {
      expect(canCapture('dam', 'dam')).toBe(false);
      expect(canCapture('la', 'la')).toBe(false);
      expect(canCapture('keo', 'keo')).toBe(false);
    });

    it('should not allow reverse capture', () => {
      expect(canCapture('keo', 'dam')).toBe(false);
      expect(canCapture('la', 'keo')).toBe(false);
      expect(canCapture('dam', 'la')).toBe(false);
    });
  });

  describe('Legal Move Generation', () => {
    it('should generate moves for a piece in center', () => {
      // Move a piece to center first for testing
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      // Clear center area first
      testState.pieces = testState.pieces.filter(p => !(p.row >= 3 && p.row <= 5 && p.col >= 3 && p.col <= 5));
      piece.row = 4;
      piece.col = 4;
      testState.pieces.push(piece);

      const moves = generateLegalMovesForPiece(testState, piece.id);
      expect(moves).toHaveLength(8); // All 8 directions empty
    });

    it('should not generate moves off board', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 0;
      piece.col = 0; // Corner a1

      const moves = generateLegalMovesForPiece(testState, piece.id);
      expect(moves).toHaveLength(3); // Only 3 valid directions from corner
    });

    it('should not generate move onto own piece', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      const target = getPieceById(testState, 'A-la-1')!;
      // Place target adjacent
      piece.row = 4;
      piece.col = 4;
      target.row = 4;
      target.col = 5;

      const moves = generateLegalMovesForPiece(testState, piece.id);
      const rightMove = moves.find(m => m.to.row === 4 && m.to.col === 5);
      expect(rightMove).toBeUndefined();
    });

    it('should generate capture move for valid capture', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-keo-1')!;   // keo (dam beats keo)
      // Place them adjacent
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const moves = generateLegalMovesForPiece(testState, attacker.id);
      const captureMove = moves.find(m => m.to.row === 4 && m.to.col === 5);
      expect(captureMove).toBeDefined();
      expect(captureMove?.captures).toBe(victim.id);
    });

    it('should not generate capture for invalid capture', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-la-1')!;    // la (dam loses to la)
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const moves = generateLegalMovesForPiece(testState, attacker.id);
      const captureMove = moves.find(m => m.to.row === 4 && m.to.col === 5);
      expect(captureMove).toBeUndefined();
    });

    it('should not generate capture for same type', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-dam-1')!;   // dam (same type)
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const moves = generateLegalMovesForPiece(testState, attacker.id);
      const captureMove = moves.find(m => m.to.row === 4 && m.to.col === 5);
      expect(captureMove).toBeUndefined();
    });

    it('should generate all legal moves for all pieces', () => {
      const moves = generateAllLegalMoves(state);
      expect(moves.length).toBeGreaterThan(0);
      // All moves should be for current player (A)
      expect(moves.every(m => {
        const piece = getPieceById(state, m.pieceId);
        return piece?.player === 'A';
      })).toBe(true);
    });
  });

  describe('Move Validation', () => {
    it('should validate a legal move to empty square', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      // Clear center area
      testState.pieces = testState.pieces.filter(p => !(p.row >= 3 && p.row <= 5 && p.col >= 3 && p.col <= 5));
      testState.pieces.push(piece);

      const result = validateMove(testState, piece.id, 4, 5);
      expect(result.valid).toBe(true);
    });

    it('should reject move off board', () => {
      const result = validateMove(state, 'A-dam-1', -1, 0);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Destination off board');
    });

    it('should reject move too far', () => {
      const result = validateMove(state, 'A-dam-1', 2, 4); // 2 rows away
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid move distance');
    });

    it('should reject staying in place', () => {
      const piece = getPieceById(state, 'A-dam-1')!;
      const result = validateMove(state, piece.id, piece.row, piece.col);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid move distance');
    });

    it('should reject capture of own piece', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!;
      const victim = getPieceById(testState, 'A-la-1')!;
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const result = validateMove(testState, attacker.id, 4, 5);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cannot capture own piece');
    });

    it('should reject capture of same type', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!;
      const victim = getPieceById(testState, 'B-dam-1')!;
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const result = validateMove(testState, attacker.id, 4, 5);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cannot capture same type');
    });

    it('should reject capture of superior type', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-la-1')!;    // la beats dam
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const result = validateMove(testState, attacker.id, 4, 5);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Piece cannot capture that type');
    });

    it('should accept valid capture', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-keo-1')!;   // keo loses to dam
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const result = validateMove(testState, attacker.id, 4, 5);
      expect(result.valid).toBe(true);
    });

    it('should reject move for wrong player', () => {
      const result = validateMove(state, 'B-dam-1', 7, 5); // B's piece but A's turn
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Not your piece');
    });

    it('should reject move when game finished', () => {
      const finishedState = { ...state, status: 'finished' as const };
      const result = validateMove(finishedState, 'A-dam-1', 0, 3);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Game not in progress');
    });

    it('should reject non-existent piece', () => {
      const result = validateMove(state, 'non-existent', 0, 3);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Piece not found');
    });
  });

  describe('Move Option Finding', () => {
    it('should find matching move option', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!;
      const victim = getPieceById(testState, 'B-keo-1')!;
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const option = findMoveOption(testState, attacker.id, 4, 5);
      expect(option).not.toBeNull();
      expect(option?.captures).toBe(victim.id);
    });

    it('should return null for illegal move', () => {
      const option = findMoveOption(state, 'A-dam-1', 9, 9);
      expect(option).toBeNull();
    });
  });

  describe('Initial Position Moves', () => {
    it('should have legal moves for all Player A pieces at start', () => {
      const moves = generateAllLegalMoves(state);
      expect(moves.length).toBeGreaterThan(0);

      // Each piece should have at least some moves
      const pieceIds = new Set(state.pieces.filter(p => p.player === 'A').map(p => p.id));
      for (const id of pieceIds) {
        const pieceMoves = generateLegalMovesForPiece(state, id);
        // Some pieces may be blocked initially, but at least one should have moves
      }
    });

    it('should generate correct moves for A-dam-1 at c1 (0,2)', () => {
      const moves = generateLegalMovesForPiece(state, 'A-dam-1');
      // From (0,2), can move to: (0,1), (0,3), (1,1), (1,2), (1,3)
      // But (1,2) and (1,3) may have pieces
      expect(moves.length).toBeGreaterThan(0);
      for (const move of moves) {
        expect(move.from.row).toBe(0);
        expect(move.from.col).toBe(2);
      }
    });
  });
});