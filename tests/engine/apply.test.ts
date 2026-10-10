import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  cloneState,
  getPieceById,
  getPieceAt,
  getPlayerPieces,
  opponent,
} from '@engine/state.js';
import { applyMove, applyMoveByCoords } from '@engine/apply.js';
import { generateLegalMovesForPiece } from '@engine/moves.js';
import { checkWin, checkDraw, getGameResult, hashPosition } from '@engine/win.js';
import type { GameState } from '@engine/types.js';

describe('Engine Apply', () => {
  let state: GameState;

  beforeEach(() => {
    state = createInitialState();
  });

  describe('Basic Move Application', () => {
    it('should move piece to empty square', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      // Clear area
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const moves = generateLegalMovesForPiece(testState, piece.id);
      const move = moves.find(m => m.to.row === 4 && m.to.col === 5);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      expect(result.success).toBe(true);
      expect(result.state.pieces.find(p => p.id === piece.id)?.row).toBe(4);
      expect(result.state.pieces.find(p => p.id === piece.id)?.col).toBe(5);
      expect(result.capturedPiece).toBeNull();
    });

    it('should capture enemy piece', () => {
      const testState = cloneState(state);
      const attacker = getPieceById(testState, 'A-dam-1')!; // dam
      const victim = getPieceById(testState, 'B-keo-1')!;   // keo (dam beats keo)
      attacker.row = 4;
      attacker.col = 4;
      victim.row = 4;
      victim.col = 5;

      const move = generateLegalMovesForPiece(testState, attacker.id).find(m => m.to.row === 4 && m.to.col === 5);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      expect(result.success).toBe(true);
      expect(result.capturedPiece).not.toBeNull();
      expect(result.capturedPiece?.id).toBe(victim.id);
      expect(result.capturedPiece?.type).toBe('keo');

      // Victim should be removed from board
      expect(result.state.pieces.find(p => p.id === victim.id)).toBeUndefined();
      // Attacker should be at victim's position
      expect(result.state.pieces.find(p => p.id === attacker.id)?.row).toBe(4);
      expect(result.state.pieces.find(p => p.id === attacker.id)?.col).toBe(5);
    });

    it('should switch turn after move', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 4 && m.to.col === 5);
      const result = applyMove(testState, move!);

      expect(result.state.currentPlayer).toBe('B');
      expect(result.state.turn).toBe(2);
    });

    it('should record last move', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 4 && m.to.col === 5);
      const result = applyMove(testState, move!);

      expect(result.state.lastMove).not.toBeNull();
      expect(result.state.lastMove?.pieceId).toBe(piece.id);
      expect(result.state.lastMove?.from.row).toBe(4);
      expect(result.state.lastMove?.from.col).toBe(4);
      expect(result.state.lastMove?.to.row).toBe(4);
      expect(result.state.lastMove?.to.col).toBe(5);
      expect(result.state.lastMove?.player).toBe('A');
      expect(result.state.lastMove?.turn).toBe(1);
    });

    it('should not modify original state', () => {
      const testState = cloneState(state);
      const originalTurn = testState.turn;
      const originalPlayer = testState.currentPlayer;
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 4 && m.to.col === 5);
      applyMove(testState, move!);

      // Original state should be unchanged
      expect(testState.turn).toBe(originalTurn);
      expect(testState.currentPlayer).toBe(originalPlayer);
      expect(testState.pieces.find(p => p.id === piece.id)?.row).toBe(4);
      expect(testState.pieces.find(p => p.id === piece.id)?.col).toBe(4);
    });
  });

  describe('Win Detection - Type Elimination', () => {
    it('should detect win when opponent loses all dam', () => {
      const testState = cloneState(state);
      // Remove all B's dam pieces
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'dam'));

      const win = checkWin(testState);
      expect(win.isWin).toBe(true);
      expect(win.winner).toBe('A');
      expect(win.reason).toBe('type_elimination');
    });

    it('should detect win when opponent loses all la', () => {
      const testState = cloneState(state);
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'la'));

      const win = checkWin(testState);
      expect(win.isWin).toBe(true);
      expect(win.winner).toBe('A');
      expect(win.reason).toBe('type_elimination');
    });

    it('should detect win when opponent loses all keo', () => {
      const testState = cloneState(state);
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'keo'));

      const win = checkWin(testState);
      expect(win.isWin).toBe(true);
      expect(win.winner).toBe('A');
      expect(win.reason).toBe('type_elimination');
    });

    it('should detect win via capture eliminating last type', () => {
      const testState = cloneState(state);
      // Set up: B has only 1 keo left at (4,5), A has dam at (4,4)
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'keo' && p.id !== 'B-keo-1'));
      // Ensure B-keo-1 is at (4,5)
      const victim = getPieceById(testState, 'B-keo-1')!;
      victim.row = 4;
      victim.col = 5;

      const attacker = getPieceById(testState, 'A-dam-1')!;
      attacker.row = 4;
      attacker.col = 4;

      // Remove any other pieces at those positions
      testState.pieces = testState.pieces.filter(p =>
        !(p.row === 4 && p.col === 4 && p.id !== attacker.id) &&
        !(p.row === 4 && p.col === 5 && p.id !== victim.id)
      );
      // attacker and victim are already in the array, no need to push
      testState.currentPlayer = 'A';
      testState.turn = 10;

      const move = generateLegalMovesForPiece(testState, attacker.id).find(m => m.to.row === 4 && m.to.col === 5);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      expect(result.success).toBe(true);
      expect(result.state.status).toBe('finished');
      expect(result.state.winner).toBe('A');
      expect(result.state.winReason).toBe('type_elimination');
    });
  });

  describe('Win Detection - Goal Square', () => {
    it('should detect win when piece reaches a1 (0,0)', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 0;
      piece.col = 1; // Adjacent to a1
      testState.currentPlayer = 'A';

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 0 && m.to.col === 0);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      expect(result.success).toBe(true);
      expect(result.state.status).toBe('finished');
      expect(result.state.winner).toBe('A');
      expect(result.state.winReason).toBe('goal_reached');
    });

    it('should detect win when piece reaches i9 (8,8)', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'B-dam-1')!;
      piece.row = 8;
      piece.col = 7; // Adjacent to i9
      testState.currentPlayer = 'B';

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 8 && m.to.col === 8);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      expect(result.success).toBe(true);
      expect(result.state.status).toBe('finished');
      expect(result.state.winner).toBe('B');
      expect(result.state.winReason).toBe('goal_reached');
    });

    it('should not declare win for non-goal squares', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const move = generateLegalMovesForPiece(testState, piece.id).find(m => m.to.row === 4 && m.to.col === 5);
      const result = applyMove(testState, move!);

      expect(result.state.status).toBe('playing');
      expect(result.state.winner).toBeNull();
    });
  });

  describe('Win Priority', () => {
    it('should prioritize type elimination over goal square if both occur', () => {
      // This tests the order: type elimination checked first
      const testState = cloneState(state);
      // B has only 1 keo at a1 (0,0), A has dam adjacent
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'keo' && p.id !== 'B-keo-1'));
      const victim = getPieceById(testState, 'B-keo-1')!;
      victim.row = 0;
      victim.col = 0; // a1 - goal square

      const attacker = getPieceById(testState, 'A-dam-1')!;
      attacker.row = 0;
      attacker.col = 1;

      testState.pieces = testState.pieces.filter(p =>
        !(p.row === 0 && p.col === 1 && p.id !== attacker.id) &&
        !(p.row === 0 && p.col === 0 && p.id !== victim.id)
      );
      // attacker and victim are already in the array, no need to push
      testState.currentPlayer = 'A';

      const move = generateLegalMovesForPiece(testState, attacker.id).find(m => m.to.row === 0 && m.to.col === 0);
      expect(move).toBeDefined();

      const result = applyMove(testState, move!);
      // Capture at a1 eliminates B's last keo AND reaches goal square
      // Type elimination should win (checked first)
      expect(result.state.winReason).toBe('type_elimination');
    });
  });

  describe('Draw Detection', () => {
    it('should detect draw at turn limit', () => {
      const testState = cloneState(state);
      testState.turn = 201; // Over default maxTurns (200)

      const draw = checkDraw(testState, { maxTurns: 200 });
      expect(draw.isDraw).toBe(true);
      expect(draw.reason).toBe('turn_limit');
    });

    it('should not detect draw before turn limit', () => {
      const draw = checkDraw(state, { maxTurns: 200 });
      expect(draw.isDraw).toBe(false);
    });

    it('should detect threefold repetition', () => {
      const testState = cloneState(state);
      const posHash = hashPosition(testState);
      const history = [posHash, 'other', posHash, 'other', posHash];

      const draw = checkDraw(testState, { maxTurns: 200, positionHistory: history });
      expect(draw.isDraw).toBe(true);
      expect(draw.reason).toBe('repetition');
    });

    it('should not detect repetition with only 2 occurrences', () => {
      const testState = cloneState(state);
      const posHash = hashPosition(testState);
      const history = [posHash, 'other', posHash];

      const draw = checkDraw(testState, { maxTurns: 200, positionHistory: history });
      expect(draw.isDraw).toBe(false);
    });

    it('should detect insufficient material when both have only same type', () => {
      const testState = cloneState(state);
      // Both players only have dam left
      testState.pieces = testState.pieces.filter(p => p.type === 'dam');

      const draw = checkDraw(testState, { maxTurns: 200 });
      expect(draw.isDraw).toBe(true);
      expect(draw.reason).toBe('insufficient_material');
    });

    it('should not detect insufficient material if players have different types', () => {
      const testState = cloneState(state);
      // A has dam, B has la - they can capture each other
      testState.pieces = testState.pieces.filter(p =>
        (p.player === 'A' && p.type === 'dam') ||
        (p.player === 'B' && p.type === 'la')
      );

      const draw = checkDraw(testState, { maxTurns: 200 });
      expect(draw.isDraw).toBe(false);
    });
  });

  describe('Game Result', () => {
    it('should return finished with winner for win', () => {
      const testState = cloneState(state);
      testState.pieces = testState.pieces.filter(p => !(p.player === 'B' && p.type === 'dam'));

      const result = getGameResult(testState, { maxTurns: 200 });
      expect(result.finished).toBe(true);
      expect(result.winner).toBe('A');
      expect(result.reason).toBe('type_elimination');
    });

    it('should return finished with draw for turn limit', () => {
      const testState = cloneState(state);
      testState.turn = 201;

      const result = getGameResult(testState, { maxTurns: 200 });
      expect(result.finished).toBe(true);
      expect(result.winner).toBe('draw');
      expect(result.reason).toBe('turn_limit');
    });

    it('should return not finished for ongoing game', () => {
      const result = getGameResult(state, { maxTurns: 200 });
      expect(result.finished).toBe(false);
      expect(result.winner).toBeNull();
    });
  });

  describe('Apply Move by Coords', () => {
    it('should apply move using coordinates', () => {
      const testState = cloneState(state);
      const piece = getPieceById(testState, 'A-dam-1')!;
      piece.row = 4;
      piece.col = 4;
      testState.pieces = testState.pieces.filter(p => !(p.row === 4 && p.col === 5));
      testState.pieces.push(piece);

      const result = applyMoveByCoords(testState, piece.id, 4, 5);
      expect(result.success).toBe(true);
      expect(result.state.pieces.find(p => p.id === piece.id)?.col).toBe(5);
    });

    it('should reject invalid move', () => {
      const result = applyMoveByCoords(state, 'A-dam-1', 9, 9);
      expect(result.success).toBe(false);
    });
  });
});