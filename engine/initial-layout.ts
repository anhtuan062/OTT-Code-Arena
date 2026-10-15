import { createHash } from 'node:crypto';
import type { InitialPieceConfig, PieceType, Player } from './types.js';

type Layout = ReadonlyArray<readonly [PieceType, number, number]>;

// The first layout preserves the historical opening. Other layouts keep the
// same material and distance from the goals while changing the tactical lanes.
const A_LAYOUTS: readonly Layout[] = [
  [
    ['dam', 0, 2], ['dam', 1, 6], ['dam', 2, 7],
    ['la', 0, 5], ['la', 1, 8], ['la', 2, 1],
    ['keo', 0, 8], ['keo', 1, 3], ['keo', 2, 4],
  ],
  [
    ['dam', 0, 1], ['dam', 1, 4], ['dam', 2, 7],
    ['la', 0, 3], ['la', 1, 7], ['la', 2, 1],
    ['keo', 0, 6], ['keo', 1, 2], ['keo', 2, 5],
  ],
  [
    ['dam', 0, 1], ['dam', 1, 5], ['dam', 2, 8],
    ['la', 0, 4], ['la', 1, 0], ['la', 2, 6],
    ['keo', 0, 7], ['keo', 1, 3], ['keo', 2, 2],
  ],
];

function stableSeedIndex(seed: string, gameNumber: number): number {
  const digest = createHash('sha256').update(`${seed}:board-layout`).digest();
  // Derive one stable base layout from the series seed, then rotate it by
  // game number. This guarantees Ván 1, 2 and 3 are always different while
  // remaining stable across retry/restart/replay.
  return (digest[0]! + gameNumber - 1) % A_LAYOUTS.length;
}

function mirrorForB(row: number, col: number): readonly [number, number] {
  return [8 - row, 8 - col];
}

export function createSeededInitialPieces(seed: string, gameNumber: 1 | 2 | 3): InitialPieceConfig[] {
  const layout = A_LAYOUTS[stableSeedIndex(seed, gameNumber)]!;
  const pieces: InitialPieceConfig[] = [];
  for (const player of ['A', 'B'] as const satisfies readonly Player[]) {
    for (const [type, row, col] of layout) {
      const position = player === 'A' ? [row, col] as const : mirrorForB(row, col);
      pieces.push({ type, player, row: position[0], col: position[1] });
    }
  }
  return pieces;
}
