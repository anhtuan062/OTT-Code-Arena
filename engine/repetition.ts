/**
 * Repetition detection and loss conditions
 */

import type { Position, Player } from './types.js';

export interface RepetitionMove {
  player: Player;
  pieceId: string;
  from: Position;
  to: Position;
  captures: string | null;
}

export function isSamePos(p1: Position, p2: Position): boolean {
  return p1.row === p2.row && p1.col === p2.col;
}

/**
 * Checks if the last move made by `lastPlayer` triggers a repetition loss.
 *
 * Rules:
 * 1. Piece oscillation: The same piece alternates between two squares for 4 consecutive
 *    moves without any captures (e.g. A -> B -> A -> B -> A, visiting square A 3 times).
 *    Matches user specification: "bot nào lặp 3 lần thì bot đó thua (ví dụ d3-d4-d3-d4-d3)".
 * 2. Directed move repetition: The same piece executes the exact same directed move
 *    (A -> B) 3 times without any intervening capture.
 * 3. Board state threefold repetition: The exact board state hash has occurred 3 times.
 */
export function checkRepetitionLoss(
  moves: readonly RepetitionMove[],
  lastPlayer: Player,
  positionHistory?: readonly string[],
  currentPositionHash?: string
): boolean {
  if (moves.length === 0) return false;

  const lastMove = moves[moves.length - 1];
  if (!lastMove) return false;

  // If the last move was not by lastPlayer or was a capture, no repetition loss
  if (lastMove.player !== lastPlayer || lastMove.captures !== null) {
    return false;
  }

  // 1. Piece-level checks (only moves since the last capture on the board)
  let lastCaptureIdx = -1;
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    if (m && m.captures !== null) {
      lastCaptureIdx = i;
      break;
    }
  }
  const relevantMoves = lastCaptureIdx >= 0 ? moves.slice(lastCaptureIdx + 1) : moves;

  const pieceMoves = relevantMoves.filter(
    (m): m is RepetitionMove => m !== undefined && m.player === lastPlayer && m.pieceId === lastMove.pieceId
  );

  // 1a. 4-move oscillation: A -> B -> A -> B -> A (reaching A for the 3rd time)
  if (pieceMoves.length >= 4) {
    const m0 = pieceMoves[pieceMoves.length - 4];
    const m1 = pieceMoves[pieceMoves.length - 3];
    const m2 = pieceMoves[pieceMoves.length - 2];
    const m3 = pieceMoves[pieceMoves.length - 1];

    if (m0 && m1 && m2 && m3) {
      const isOscillation =
        isSamePos(m0.from, m1.to) &&
        isSamePos(m0.to, m1.from) &&
        isSamePos(m2.from, m0.from) &&
        isSamePos(m2.to, m0.to) &&
        isSamePos(m3.from, m1.from) &&
        isSamePos(m3.to, m1.to);

      if (isOscillation) {
        return true;
      }
    }
  }

  // 1b. Directed move repeated 3 times by the same piece: A -> B performed 3 times
  if (pieceMoves.length >= 3) {
    const sameMoveCount = pieceMoves.filter(
      m => isSamePos(m.from, lastMove.from) && isSamePos(m.to, lastMove.to)
    ).length;

    if (sameMoveCount >= 3) {
      return true;
    }
  }

  // 2. Threefold board repetition
  if (positionHistory && positionHistory.length >= 3 && currentPositionHash) {
    let count = 0;
    for (const h of positionHistory) {
      if (h === currentPositionHash) {
        count++;
      }
    }
    if (count >= 3) {
      return true;
    }
  }

  return false;
}

