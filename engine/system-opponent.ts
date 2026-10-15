import { applyMove } from './apply.js';
import { canCapture, generateAllLegalMoves } from './moves.js';
import { getPieceById, isPlayerGoalSquare } from './state.js';
import { GameState, MoveOption, Piece, Player, Position } from './types.js';

const PIECE_VALUE: Record<Piece['type'], number> = { dam: 320, la: 230, keo: 150 };

function distanceToGoal(position: Position, player: Player): number {
  const goal = player === 'A' ? { row: 8, col: 8 } : { row: 0, col: 0 };
  return Math.max(Math.abs(position.row - goal.row), Math.abs(position.col - goal.col));
}

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function nearestDistance(pieces: Piece[], player: Player): number {
  return Math.min(...pieces.filter(piece => piece.player === player)
    .map(piece => distanceToGoal(piece, player)), Number.MAX_SAFE_INTEGER);
}

function isThreatened(state: GameState, move: MoveOption, movingPiece: Piece): boolean {
  return state.pieces.some(enemy => enemy.player !== movingPiece.player && enemy.id !== move.captures &&
    distance(enemy, move.to) === 1 && canCapture(enemy.type, movingPiece.type));
}

function material(state: GameState, player: Player): number {
  return state.pieces.reduce((score, piece) => score + (piece.player === player ? PIECE_VALUE[piece.type] : -PIECE_VALUE[piece.type]), 0);
}

/** Static evaluation from the supplied player's perspective. */
function evaluate(state: GameState, player: Player): number {
  const enemy = player === 'A' ? 'B' : 'A';
  if (state.status === 'finished') return state.winner === player ? 1_000_000 : -1_000_000;
  const own = state.pieces.filter(piece => piece.player === player);
  const opponents = state.pieces.filter(piece => piece.player === enemy);
  const ownGoal = nearestDistance(state.pieces, player);
  const enemyGoal = nearestDistance(state.pieces, enemy);
  const threatened = own.filter(piece => state.pieces.some(other => other.player === enemy &&
    distance(piece, other) === 1 && canCapture(other.type, piece.type))).length;
  return material(state, player) + (enemyGoal - ownGoal) * 180 - threatened * 90 +
    own.length * 12 - opponents.length * 12;
}

function tacticalScore(state: GameState, move: MoveOption, movingPiece: Piece): number {
  const before = distanceToGoal(movingPiece, movingPiece.player);
  const after = distanceToGoal(move.to, movingPiece.player);
  let score = (before - after) * 150;
  if (isPlayerGoalSquare(move.to, movingPiece.player)) score += 1_000_000;
  if (move.captures) {
    const captured = getPieceById(state, move.captures);
    score += 12_000 + (captured ? PIECE_VALUE[captured.type] : 0);
  }
  if (isThreatened(state, move, movingPiece) && !move.captures) score -= 2_500;
  return score;
}

/** Deterministic bounded two-ply search: own move plus the opponent's best reply. */
export function chooseSystemOpponentMove(state: GameState, legalMoves: MoveOption[]): MoveOption | null {
  if (!legalMoves.length) return null;
  const player = state.currentPlayer;
  const ranked = legalMoves.map((move, index) => {
    const piece = getPieceById(state, move.pieceId);
    if (!piece) return { move, score: Number.MIN_SAFE_INTEGER, key: `${index}` };
    const applied = applyMove(state, move);
    let score = tacticalScore(state, move, piece) + evaluate(applied.state, player);
    if (applied.state.status !== 'finished') {
      const replies = generateAllLegalMoves(applied.state);
      if (replies.length) {
        const worstReply = Math.max(...replies.map(reply => -evaluate(applyMove(applied.state, reply).state, player)));
        score += worstReply * 0.55;
      }
    }
    const key = `${String(100000000 - Math.round(score)).padStart(10, '0')}:${move.pieceId}:${move.to.row}:${move.to.col}`;
    return { move, score, key };
  });
  ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return ranked[0]?.move ?? legalMoves[0] ?? null;
}
