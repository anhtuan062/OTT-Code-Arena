import { describe, expect, it } from 'vitest';
import { chooseSystemOpponentMove } from '../../engine/system-opponent.js';
import type { GameState, MoveOption } from '../../engine/types.js';

function state(pieces: GameState['pieces']): GameState {
  return { boardSize: 9, currentPlayer: 'B', turn: 1, pieces, status: 'playing', winner: null, winReason: null, lastMove: null };
}

function move(pieceId: string, from: [number, number], to: [number, number], captures: string | null = null): MoveOption {
  return { pieceId, from: { row: from[0], col: from[1] }, to: { row: to[0], col: to[1] }, captures };
}

describe('system opponent strategy', () => {
  it('advances toward its goal when it is ahead and avoids a capturable square', () => {
    const current = state([
      { id: 'B-la-1', type: 'la', player: 'B', row: 2, col: 2 },
      { id: 'B-dam-1', type: 'dam', player: 'B', row: 4, col: 4 },
      { id: 'A-keo-1', type: 'keo', player: 'A', row: 2, col: 1 },
      { id: 'A-dam-1', type: 'dam', player: 'A', row: 5, col: 5 },
    ]);
    const moves = [
      move('B-la-1', [2, 2], [1, 1]),
      move('B-la-1', [2, 2], [2, 3]),
    ];
    expect(chooseSystemOpponentMove(current, moves)?.to).toEqual({ row: 2, col: 3 });
  });

  it('captures when the opponent is closer to its goal', () => {
    const current = state([
      { id: 'B-la-1', type: 'la', player: 'B', row: 6, col: 6 },
      { id: 'A-dam-1', type: 'dam', player: 'A', row: 7, col: 7 },
    ]);
    const moves = [
      move('B-la-1', [6, 6], [6, 7]),
      move('B-la-1', [6, 6], [7, 7], 'A-dam-1'),
    ];
    expect(chooseSystemOpponentMove(current, moves)?.captures).toBe('A-dam-1');
  });
});
