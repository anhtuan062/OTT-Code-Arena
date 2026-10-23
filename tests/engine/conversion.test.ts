import { describe, expect, it } from 'vitest';
import { applyMove } from '../../engine/apply.js';
import { generateAllLegalMoves, generateLegalMovesForPiece } from '../../engine/moves.js';
import type { GameState } from '../../engine/types.js';

function state(): GameState {
  return {
    boardSize: 9,
    currentPlayer: 'A',
    turn: 1,
    status: 'playing',
    winner: null,
    winReason: null,
    lastMove: null,
    pieces: [
      { id: 'piece-alpha', type: 'dam', player: 'A', row: 2, col: 2 },
      { id: 'piece-beta', type: 'keo', player: 'B', row: 2, col: 3 },
      { id: 'piece-b-dam', type: 'dam', player: 'B', row: 3, col: 3 },
    ],
  };
}

describe('Conversion rule modifier', () => {
  it('keeps the captured id/type and relocates it to the nearest deterministic empty square', () => {
    const result = applyMove(state(), { pieceId: 'piece-alpha', from: { row: 2, col: 2 }, to: { row: 2, col: 3 }, captures: 'piece-beta' }, { conversion: true });
    expect(result.success).toBe(true);
    expect(result.conversionTo).toEqual({ row: 1, col: 3 });
    expect(result.state.pieces).toEqual(expect.arrayContaining([
      { id: 'piece-alpha', type: 'dam', player: 'A', row: 2, col: 3 },
      { id: 'piece-beta', type: 'keo', player: 'A', row: 1, col: 3 },
    ]));
    expect(result.state.pieces).toHaveLength(3);
  });

  it('preserves standard capture behavior when the modifier is disabled', () => {
    const result = applyMove(state(), { pieceId: 'piece-alpha', from: { row: 2, col: 2 }, to: { row: 2, col: 3 }, captures: 'piece-beta' });
    expect(result.success).toBe(true);
    expect(result.state.pieces.find(piece => piece.id === 'piece-beta')).toBeUndefined();
  });

  it('supports the same piece id changing sides repeatedly without using its origin square', () => {
    const repeatedState = { ...state(), pieces: [
      { id: 'piece-alpha', type: 'dam' as const, player: 'A' as const, row: 2, col: 2 },
      { id: 'piece-beta', type: 'keo' as const, player: 'B' as const, row: 2, col: 3 },
      { id: 'piece-b-dam', type: 'dam' as const, player: 'B' as const, row: 2, col: 4 },
    ] };
    const first = applyMove(repeatedState, { pieceId: 'piece-alpha', from: { row: 2, col: 2 }, to: { row: 2, col: 3 }, captures: 'piece-beta' }, { conversion: true });
    const second = applyMove(first.state, { pieceId: 'piece-b-dam', from: { row: 2, col: 4 }, to: { row: 1, col: 3 }, captures: 'piece-beta' }, { conversion: true });
    expect(second.success).toBe(true);
    const convertedBack = second.state.pieces.find(piece => piece.id === 'piece-beta');
    expect(convertedBack).toMatchObject({ id: 'piece-beta', type: 'keo', player: 'B', row: 0, col: 3 });
    expect(generateAllLegalMoves(second.state, { conversion: true }).every(move => second.state.pieces.find(piece => piece.id === move.pieceId)?.player === second.state.currentPlayer)).toBe(true);
    expect(generateLegalMovesForPiece(second.state, 'piece-beta', { conversion: true }).length).toBeGreaterThanOrEqual(0);
  });
});
