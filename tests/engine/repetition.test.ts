import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../engine/index.js';
import { checkRepetitionLoss, type RepetitionMove } from '../../engine/repetition.js';

describe('Repetition Loss Detection', () => {
  describe('checkRepetitionLoss unit logic', () => {
    it('detects 4-move piece oscillation d3-d4-d3-d4-d3 as repetition loss', () => {
      // Piece oscillates: d3 (start) -> d4 -> d3 -> d4 -> d3
      // Visited d3 3 times.
      const d3 = { row: 3, col: 3 };
      const d4 = { row: 3, col: 4 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'B', pieceId: 'B_dam_1', from: { row: 7, col: 0 }, to: { row: 7, col: 1 }, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
        { player: 'B', pieceId: 'B_dam_1', from: { row: 7, col: 1 }, to: { row: 7, col: 0 }, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'B', pieceId: 'B_dam_1', from: { row: 7, col: 0 }, to: { row: 7, col: 1 }, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(true);
    });

    it('does not trigger repetition loss before 3 repetitions (only 3 moves d3-d4-d3-d4)', () => {
      const d3 = { row: 3, col: 3 };
      const d4 = { row: 3, col: 4 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'B', pieceId: 'B_dam_1', from: { row: 7, col: 0 }, to: { row: 7, col: 1 }, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
        { player: 'B', pieceId: 'B_dam_1', from: { row: 7, col: 1 }, to: { row: 7, col: 0 }, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(false);
    });

    it('does not trigger repetition loss if player breaks oscillation on 4th move', () => {
      const d3 = { row: 3, col: 3 };
      const d4 = { row: 3, col: 4 };
      const e3 = { row: 4, col: 3 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: e3, captures: null },
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(false);
    });

    it('does not trigger repetition loss if a capture resets the board material', () => {
      const d3 = { row: 3, col: 3 };
      const d4 = { row: 3, col: 4 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
        { player: 'B', pieceId: 'B_la_1', from: { row: 5, col: 5 }, to: { row: 5, col: 6 }, captures: 'A_keo_1' },
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(false);
    });

    it('does not trigger repetition loss if the 4th move was a capture', () => {
      const d3 = { row: 3, col: 3 };
      const d4 = { row: 3, col: 4 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d3, to: d4, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: d4, to: d3, captures: 'B_keo_1' },
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(false);
    });

    it('detects directed move repeated 3 times as repetition loss', () => {
      const a = { row: 2, col: 2 };
      const b = { row: 2, col: 3 };
      const c = { row: 3, col: 3 };

      const moves: RepetitionMove[] = [
        { player: 'A', pieceId: 'A_dam_1', from: a, to: b, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: b, to: c, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: c, to: a, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: a, to: b, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: b, to: c, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: c, to: a, captures: null },
        { player: 'A', pieceId: 'A_dam_1', from: a, to: b, captures: null }, // 3rd time a -> b
      ];

      const result = checkRepetitionLoss(moves, 'A');
      expect(result).toBe(true);
    });

    it('detects threefold board position hash repetition as repetition loss', () => {
      const dummyMove: RepetitionMove = {
        player: 'A',
        pieceId: 'A_dam_1',
        from: { row: 0, col: 2 },
        to: { row: 0, col: 3 },
        captures: null,
      };

      const hash = 'pos_hash_123';
      const history = [hash, 'hash_other_1', hash, 'hash_other_2', hash];

      const result = checkRepetitionLoss([dummyMove], 'A', history, hash);
      expect(result).toBe(true);
    });
  });

  describe('GameEngine integration', () => {
    it('sets finished status and awards victory to opponent when bot repeats 3 times', () => {
      const engine = new GameEngine({
        initialPieces: [
          // Place A's dam at row 3, col 3 (d4 in 0-indexed: row 3, col 3)
          { type: 'dam', player: 'A', row: 3, col: 3 },
          // Place B's dam at row 7, col 7 far away
          { type: 'dam', player: 'B', row: 7, col: 7 },
        ],
      });

      // Move 1 (A): row 3, col 3 -> row 3, col 4
      expect(engine.makeMove('A-dam-1', 3, 4).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 2 (B): row 7, col 7 -> row 7, col 6
      expect(engine.makeMove('B-dam-1', 7, 6).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 3 (A): row 3, col 4 -> row 3, col 3 (A visits (3,3) for 2nd time)
      expect(engine.makeMove('A-dam-1', 3, 3).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 4 (B): row 7, col 6 -> row 7, col 5
      expect(engine.makeMove('B-dam-1', 7, 5).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 5 (A): row 3, col 3 -> row 3, col 4 (A visits (3,4) for 2nd time)
      expect(engine.makeMove('A-dam-1', 3, 4).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 6 (B): row 7, col 5 -> row 7, col 4
      expect(engine.makeMove('B-dam-1', 7, 4).success).toBe(true);
      expect(engine.isFinished()).toBe(false);

      // Move 7 (A): row 3, col 4 -> row 3, col 3 (A visits (3,3) for 3rd time: 3-repetition!)
      const move7 = engine.makeMove('A-dam-1', 3, 3);
      expect(move7.success).toBe(true);

      // Player A has repeated 3 times (d3-d4-d3-d4-d3) -> Player A loses, Player B wins!
      expect(engine.isFinished()).toBe(true);
      expect(engine.getWinner()).toBe('B');
      expect(engine.getWinReason()).toBe('repetition');

      const gameOver = engine.checkGameOver();
      expect(gameOver.finished).toBe(true);
      expect(gameOver.winner).toBe('B');
      expect(gameOver.reason).toBe('repetition');
    });
  });
});
