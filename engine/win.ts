/**
 * Win and draw detection
 */

import { GameState, WinReason, Player, Position, GOAL_SQUARES } from './types.js';
import { getPlayerPieces, isPlayerGoalSquare } from './state.js';

export interface WinCheckResult {
  isWin: boolean;
  winner: Player | null;
  reason: WinReason | null;
}

export function checkWin(state: GameState): WinCheckResult {
  if (state.status === 'finished') {
    return {
      isWin: true,
      winner: state.winner,
      reason: state.winReason,
    };
  }

  // A player wins only after capturing every opposing piece.
  const aPieces = getPlayerPieces(state, 'A');
  const bPieces = getPlayerPieces(state, 'B');
  if (bPieces.length === 0 && aPieces.length > 0) {
    return {
      isWin: true,
      winner: 'A',
      reason: 'all_pieces_captured',
    };
  }
  if (aPieces.length === 0 && bPieces.length > 0) {
    return {
      isWin: true,
      winner: 'B',
      reason: 'all_pieces_captured',
    };
  }

  // Check goal squares
  if (state.lastMove) {
    const lastPos = state.lastMove.to;
    if (isPlayerGoalSquare(lastPos, state.lastMove.player)) {
      return {
        isWin: true,
        winner: state.lastMove.player,
        reason: 'goal_reached',
      };
    }
  }

  return { isWin: false, winner: null, reason: null };
}

export interface DrawCheckResult {
  isDraw: boolean;
  reason: 'turn_limit' | 'repetition' | 'insufficient_material' | null;
}

export function checkDraw(state: GameState, config: { maxTurns: number; positionHistory?: string[] }): DrawCheckResult {
  // Turn limit
  if (state.turn > config.maxTurns) {
    return { isDraw: true, reason: 'turn_limit' };
  }

  // Threefold repetition (if history provided)
  if (config.positionHistory && config.positionHistory.length >= 3) {
    const currentHash = hashPosition(state);
    let count = 0;
    for (const h of config.positionHistory) {
      if (h === currentHash) count++;
    }
    if (count >= 3) {
      return { isDraw: true, reason: 'repetition' };
    }
  }

  // Insufficient material - both players missing same type
  const aTypes = new Set(getPlayerPieces(state, 'A').map(p => p.type));
  const bTypes = new Set(getPlayerPieces(state, 'B').map(p => p.type));

  // If both players only have one type left and it's the same type, neither can capture
  if (aTypes.size === 1 && bTypes.size === 1) {
    const aType = [...aTypes][0];
    const bType = [...bTypes][0];
    if (aType === bType) {
      return { isDraw: true, reason: 'insufficient_material' };
    }
  }

  return { isDraw: false, reason: null };
}

export function hashPosition(state: GameState): string {
  // Create a deterministic hash of the position
  const pieces = [...state.pieces].sort((a, b) => a.id.localeCompare(b.id));
  const pieceStr = pieces.map(p => `${p.id}:${p.type}:${p.player}:${p.row}:${p.col}`).join(';');
  return `${state.currentPlayer}:${pieceStr}`;
}

export function getGameResult(state: GameState, config: { maxTurns: number }): {
  finished: boolean;
  winner: Player | 'draw' | null;
  reason: WinReason | 'turn_limit' | 'repetition' | 'insufficient_material' | null;
} {
  const win = checkWin(state);
  if (win.isWin) {
    return { finished: true, winner: win.winner, reason: win.reason };
  }

  const draw = checkDraw(state, config);
  if (draw.isDraw) {
    return { finished: true, winner: 'draw', reason: draw.reason };
  }

  return { finished: false, winner: null, reason: null };
}
