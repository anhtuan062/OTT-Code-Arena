import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  cloneState,
  getPieceAt,
  getPieceById,
  getPlayerPieces,
  getPieceTypesForPlayer,
  countPlayerPiecesByType,
  isInsideBoard,
  isGoalSquare,
  algebraicToPos,
  posToAlgebraic,
  opponent,
  validateState,
  DEFAULT_CONFIG,
  GOAL_SQUARES,
} from '@engine/state.js';
import type { GameState, Piece } from '@engine/types.js';

describe('Engine State', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  describe('Initial State', () => {
    it('should have correct board size', () => {
      expect(state.boardSize).toBe(9);
    });

    it('should start with player A', () => {
      expect(state.currentPlayer).toBe('A');
    });

    it('should start at turn 1', () => {
      expect(state.turn).toBe(1);
    });

    it('should have playing status', () => {
      expect(state.status).toBe('playing');
    });

    it('should have no winner', () => {
      expect(state.winner).toBeNull();
      expect(state.winReason).toBeNull();
    });

    it('should have 18 pieces total (9 per player)', () => {
      expect(state.pieces).toHaveLength(18);
      const aPieces = state.pieces.filter(p => p.player === 'A');
      const bPieces = state.pieces.filter(p => p.player === 'B');
      expect(aPieces).toHaveLength(9);
      expect(bPieces).toHaveLength(9);
    });

    it('should have 3 of each type per player', () => {
      const aCounts = countPlayerPiecesByType(state, 'A');
      const bCounts = countPlayerPiecesByType(state, 'B');
      expect(aCounts.dam).toBe(3);
      expect(aCounts.la).toBe(3);
      expect(aCounts.keo).toBe(3);
      expect(bCounts.dam).toBe(3);
      expect(bCounts.la).toBe(3);
      expect(bCounts.keo).toBe(3);
    });

    it('should have correct initial positions for Player A', () => {
      const aPieces = getPlayerPieces(state, 'A');
      const positions = new Set(aPieces.map(p => `${p.row},${p.col}`));

      // Player A pieces at rows 0-2
      expect(positions.has('0,2')).toBe(true);  // dam c1
      expect(positions.has('1,6')).toBe(true);  // dam g2
      expect(positions.has('2,7')).toBe(true);  // dam h3
      expect(positions.has('0,5')).toBe(true);  // la f1
      expect(positions.has('1,8')).toBe(true);  // la i2
      expect(positions.has('2,1')).toBe(true);  // la b3
      expect(positions.has('0,8')).toBe(true);  // keo i1
      expect(positions.has('1,3')).toBe(true);  // keo d2
      expect(positions.has('2,4')).toBe(true);  // keo e3
    });

    it('should have correct initial positions for Player B', () => {
      const bPieces = getPlayerPieces(state, 'B');
      const positions = new Set(bPieces.map(p => `${p.row},${p.col}`));

      // Player B pieces at rows 6-8
      expect(positions.has('8,6')).toBe(true);  // dam g9
      expect(positions.has('7,2')).toBe(true);  // dam c8
      expect(positions.has('6,1')).toBe(true);  // dam b7
      expect(positions.has('8,3')).toBe(true);  // la d9
      expect(positions.has('7,0')).toBe(true);  // la a8
      expect(positions.has('6,7')).toBe(true);  // la h7
      expect(positions.has('8,0')).toBe(true);  // keo a9
      expect(positions.has('7,5')).toBe(true);  // keo f8
      expect(positions.has('6,4')).toBe(true);  // keo e7
    });

    it('should have unique piece IDs', () => {
      const ids = state.pieces.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should pass state validation', () => {
      const result = validateState(state);
      expect(result.valid).toBe(true);
    });
  });

  describe('Coordinate Conversion', () => {
    it('should convert algebraic to position', () => {
      expect(algebraicToPos('a1')).toEqual({ row: 0, col: 0 });
      expect(algebraicToPos('i9')).toEqual({ row: 8, col: 8 });
      expect(algebraicToPos('e5')).toEqual({ row: 4, col: 4 });
      expect(algebraicToPos('c3')).toEqual({ row: 2, col: 2 });
    });

    it('should reject invalid algebraic', () => {
      expect(algebraicToPos('z1')).toBeNull();
      expect(algebraicToPos('a0')).toBeNull();
      expect(algebraicToPos('a10')).toBeNull();
      expect(algebraicToPos('j1')).toBeNull();
      expect(algebraicToPos('a')).toBeNull();
    });

    it('should convert position to algebraic', () => {
      expect(posToAlgebraic({ row: 0, col: 0 })).toBe('a1');
      expect(posToAlgebraic({ row: 8, col: 8 })).toBe('i9');
      expect(posToAlgebraic({ row: 4, col: 4 })).toBe('e5');
    });

    it('should round-trip correctly', () => {
      const squares = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9'];
      for (const sq of squares) {
        const pos = algebraicToPos(sq);
        expect(pos).not.toBeNull();
        expect(posToAlgebraic(pos!)).toBe(sq);
      }
    });
  });

  describe('Board Boundaries', () => {
    it('should identify inside board positions', () => {
      expect(isInsideBoard({ row: 0, col: 0 })).toBe(true);
      expect(isInsideBoard({ row: 8, col: 8 })).toBe(true);
      expect(isInsideBoard({ row: 4, col: 4 })).toBe(true);
    });

    it('should identify outside board positions', () => {
      expect(isInsideBoard({ row: -1, col: 0 })).toBe(false);
      expect(isInsideBoard({ row: 9, col: 0 })).toBe(false);
      expect(isInsideBoard({ row: 0, col: -1 })).toBe(false);
      expect(isInsideBoard({ row: 0, col: 9 })).toBe(false);
    });
  });

  describe('Goal Squares', () => {
    it('should identify a1 and i9 as goal squares', () => {
      expect(isGoalSquare({ row: 0, col: 0 })).toBe(true);
      expect(isGoalSquare({ row: 8, col: 8 })).toBe(true);
    });

    it('should not identify other squares as goals', () => {
      expect(isGoalSquare({ row: 0, col: 8 })).toBe(false);
      expect(isGoalSquare({ row: 8, col: 0 })).toBe(false);
      expect(isGoalSquare({ row: 4, col: 4 })).toBe(false);
    });

    it('should have correct goal square constants', () => {
      expect(GOAL_SQUARES).toHaveLength(2);
      expect(GOAL_SQUARES[0]).toEqual({ row: 0, col: 0 });
      expect(GOAL_SQUARES[1]).toEqual({ row: 8, col: 8 });
    });
  });

  describe('Piece Queries', () => {
    it('should get piece at position', () => {
      const piece = getPieceAt(state, 0, 2);
      expect(piece).not.toBeNull();
      expect(piece?.type).toBe('dam');
      expect(piece?.player).toBe('A');
    });

    it('should return null for empty square', () => {
      const piece = getPieceAt(state, 4, 4);
      expect(piece).toBeNull();
    });

    it('should get piece by ID', () => {
      const piece = getPieceById(state, 'A-dam-1');
      expect(piece).not.toBeNull();
      expect(piece?.type).toBe('dam');
    });

    it('should return null for non-existent ID', () => {
      const piece = getPieceById(state, 'non-existent');
      expect(piece).toBeNull();
    });

    it('should get player pieces', () => {
      const aPieces = getPlayerPieces(state, 'A');
      expect(aPieces).toHaveLength(9);
      expect(aPieces.every(p => p.player === 'A')).toBe(true);
    });

    it('should get piece types for player', () => {
      const aTypes = getPieceTypesForPlayer(state, 'A');
      expect(aTypes.size).toBe(3);
      expect(aTypes.has('dam')).toBe(true);
      expect(aTypes.has('la')).toBe(true);
      expect(aTypes.has('keo')).toBe(true);
    });

    it('should count pieces by type', () => {
      const counts = countPlayerPiecesByType(state, 'A');
      expect(counts.dam).toBe(3);
      expect(counts.la).toBe(3);
      expect(counts.keo).toBe(3);
    });
  });

  describe('Opponent Function', () => {
    it('should return B for A', () => {
      expect(opponent('A')).toBe('B');
    });

    it('should return A for B', () => {
      expect(opponent('B')).toBe('A');
    });
  });

  describe('State Cloning', () => {
    it('should create independent copy', () => {
      const cloned = cloneState(state);
      cloned.pieces[0].row = 99;
      expect(state.pieces[0].row).not.toBe(99);
    });

    it('should preserve all properties', () => {
      const cloned = cloneState(state);
      expect(cloned.boardSize).toBe(state.boardSize);
      expect(cloned.currentPlayer).toBe(state.currentPlayer);
      expect(cloned.turn).toBe(state.turn);
      expect(cloned.status).toBe(state.status);
      expect(cloned.pieces).toHaveLength(state.pieces.length);
    });
  });

  describe('State Validation', () => {
    it('should reject invalid board size', () => {
      const badState = { ...state, boardSize: 8 };
      expect(validateState(badState).valid).toBe(false);
    });

    it('should reject off-board piece', () => {
      const badState = cloneState(state);
      badState.pieces[0].row = 9;
      expect(validateState(badState).valid).toBe(false);
    });

    it('should reject duplicate positions', () => {
      const badState = cloneState(state);
      badState.pieces[1].row = badState.pieces[0].row;
      badState.pieces[1].col = badState.pieces[0].col;
      expect(validateState(badState).valid).toBe(false);
    });

    it('should reject duplicate IDs', () => {
      const badState = cloneState(state);
      badState.pieces[1].id = badState.pieces[0].id;
      expect(validateState(badState).valid).toBe(false);
    });

    it('should reject invalid turn', () => {
      const badState = { ...state, turn: 0 };
      expect(validateState(badState).valid).toBe(false);
    });

    it('should reject finished game without winner', () => {
      const badState = { ...state, status: 'finished' as const, winner: null };
      expect(validateState(badState).valid).toBe(false);
    });
  });
});