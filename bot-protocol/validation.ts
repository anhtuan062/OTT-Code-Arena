/**
 * Bot Protocol - Validation
 */

import {
  BotRequest,
  BotResponse,
  BotMove,
  BotPiece,
  BotMoveOption,
  BotError,
  PROTOCOL_VERSION,
  isBotResponse,
  isBotError,
  type BotResponseOrError,
  type ProtocolVersion,
  type Player,
  type PieceType,
} from './types.js';
import { algebraicToPos, posToAlgebraic } from '../engine/state.js';
import { BOARD_SIZE } from '../engine/types.js';
import type { GameState, Piece, MoveOption, Player as EnginePlayer } from '../engine/types.js';

/**
 * Validate algebraic coordinate (a1-i9)
 */
export function isValidAlgebraic(alg: string): boolean {
  if (typeof alg !== 'string' || alg.length !== 2) return false;
  const col = alg.charAt(0).toLowerCase();
  const row = alg.charAt(1);
  return 'abcdefghi'.includes(col) && row >= '1' && row <= '9';
}

/**
 * Validate piece ID format
 */
export function isValidPieceId(id: string): boolean {
  return /^[AB]-(dam|la|keo)-\d+$/.test(id);
}

/**
 * Validate BotPiece
 */
export function validateBotPiece(piece: unknown): piece is BotPiece {
  if (typeof piece !== 'object' || piece === null) return false;
  const p = piece as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    isValidPieceId(p.id) &&
    typeof p.type === 'string' &&
    ['dam', 'la', 'keo'].includes(p.type) &&
    typeof p.player === 'string' &&
    ['A', 'B'].includes(p.player) &&
    typeof p.pos === 'string' &&
    isValidAlgebraic(p.pos)
  );
}

/**
 * Validate BotMoveOption
 */
export function validateBotMoveOption(move: unknown): move is BotMoveOption {
  if (typeof move !== 'object' || move === null) return false;
  const m = move as Record<string, unknown>;
  return (
    typeof m.piece_id === 'string' &&
    isValidPieceId(m.piece_id) &&
    typeof m.from === 'string' &&
    isValidAlgebraic(m.from) &&
    typeof m.to === 'string' &&
    isValidAlgebraic(m.to) &&
    (m.captures === null || (typeof m.captures === 'string' && isValidPieceId(m.captures)))
  );
}

/**
 * Validate BotRequest
 */
export function validateBotRequest(request: unknown): { valid: boolean; error?: BotError } {
  if (typeof request !== 'object' || request === null) {
    return { valid: false, error: { code: 'INVALID_REQUEST', message: 'Request must be an object' } };
  }

  const r = request as Record<string, unknown>;

  if (r.protocol_version !== PROTOCOL_VERSION) {
    return {
      valid: false,
      error: { code: 'UNSUPPORTED_VERSION', message: `Unsupported protocol version: ${r.protocol_version}`, details: { expected: PROTOCOL_VERSION, received: r.protocol_version } },
    };
  }

  if (typeof r.match_id !== 'string' || r.match_id.length === 0) {
    return { valid: false, error: { code: 'INVALID_MATCH_ID', message: 'match_id must be a non-empty string' } };
  }

  if (typeof r.turn !== 'number' || r.turn < 1 || !Number.isInteger(r.turn)) {
    return { valid: false, error: { code: 'INVALID_TURN', message: 'turn must be a positive integer' } };
  }

  if (typeof r.player !== 'string' || !['A', 'B'].includes(r.player)) {
    return { valid: false, error: { code: 'INVALID_PLAYER', message: 'player must be "A" or "B"' } };
  }

  if (typeof r.board_size !== 'number' || r.board_size !== BOARD_SIZE) {
    return { valid: false, error: { code: 'INVALID_BOARD_SIZE', message: `board_size must be ${BOARD_SIZE}` } };
  }

  if (r.rules !== undefined && (typeof r.rules !== 'object' || r.rules === null || typeof (r.rules as Record<string, unknown>).conversion !== 'boolean')) {
    return { valid: false, error: { code: 'INVALID_RULES', message: 'rules.conversion must be boolean' } };
  }

  if (!Array.isArray(r.pieces)) {
    return { valid: false, error: { code: 'INVALID_PIECES', message: 'pieces must be an array' } };
  }

  for (let i = 0; i < r.pieces.length; i++) {
    if (!validateBotPiece(r.pieces[i])) {
      return { valid: false, error: { code: 'INVALID_PIECE', message: `Invalid piece at index ${i}`, details: { piece: r.pieces[i] } } };
    }
  }

  if (!Array.isArray(r.legal_moves)) {
    return { valid: false, error: { code: 'INVALID_LEGAL_MOVES', message: 'legal_moves must be an array' } };
  }

  for (let i = 0; i < r.legal_moves.length; i++) {
    if (!validateBotMoveOption(r.legal_moves[i])) {
      return { valid: false, error: { code: 'INVALID_LEGAL_MOVE', message: `Invalid legal move at index ${i}`, details: { move: r.legal_moves[i] } } };
    }
  }

  // Cross-validation: all legal moves must reference existing pieces
  const pieceIds = new Set(r.pieces.map((p: BotPiece) => p.id));
  for (let i = 0; i < r.legal_moves.length; i++) {
    const move = r.legal_moves[i] as BotMoveOption;
    if (!pieceIds.has(move.piece_id)) {
      return { valid: false, error: { code: 'INVALID_LEGAL_MOVE_PIECE', message: `Legal move references unknown piece: ${move.piece_id}`, details: { move } } };
    }
    if (move.captures && !pieceIds.has(move.captures)) {
      return { valid: false, error: { code: 'INVALID_LEGAL_MOVE_CAPTURE', message: `Legal move references unknown captured piece: ${move.captures}`, details: { move } } };
    }
  }

  return { valid: true };
}

/**
 * Validate BotResponse
 */
export function validateBotResponse(response: unknown): { valid: boolean; error?: BotError; move?: BotMove } {
  if (typeof response !== 'object' || response === null) {
    return { valid: false, error: { code: 'INVALID_RESPONSE', message: 'Response must be an object' } };
  }

  const r = response as Record<string, unknown>;

  if (!('move' in r)) {
    return { valid: false, error: { code: 'MISSING_MOVE', message: 'Response must contain a move object' } };
  }

  const move = r.move;
  if (typeof move !== 'object' || move === null) {
    return { valid: false, error: { code: 'INVALID_MOVE', message: 'move must be an object' } };
  }

  const m = move as Record<string, unknown>;

  if (typeof m.piece_id !== 'string' || !isValidPieceId(m.piece_id)) {
    return { valid: false, error: { code: 'INVALID_PIECE_ID', message: 'move.piece_id must be a valid piece ID' } };
  }

  if (typeof m.from !== 'string' || !isValidAlgebraic(m.from)) {
    return { valid: false, error: { code: 'INVALID_FROM', message: 'move.from must be valid algebraic notation' } };
  }

  if (typeof m.to !== 'string' || !isValidAlgebraic(m.to)) {
    return { valid: false, error: { code: 'INVALID_TO', message: 'move.to must be valid algebraic notation' } };
  }

  // from and to must be different
  if (m.from === m.to) {
    return { valid: false, error: { code: 'INVALID_MOVE_SAME_SQUARE', message: 'move.from and move.to must be different' } };
  }

  // Move distance must be 1 square
  const fromPos = algebraicToPos(m.from);
  const toPos = algebraicToPos(m.to);
  if (!fromPos || !toPos) {
    return { valid: false, error: { code: 'INVALID_COORDINATES', message: 'Invalid coordinates' } };
  }
  const dr = Math.abs(toPos.row - fromPos.row);
  const dc = Math.abs(toPos.col - fromPos.col);
  if (dr > 1 || dc > 1) {
    return { valid: false, error: { code: 'INVALID_MOVE_DISTANCE', message: 'Move distance must be 1 square' } };
  }

  return { valid: true, move: { piece_id: m.piece_id, from: m.from, to: m.to } };
}

/**
 * Parse JSON string to BotResponse with validation
 */
export function parseBotResponse(jsonString: string): { success: boolean; response?: BotResponse; error?: BotError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON', details: String(e) } };
  }

  if (isBotError(parsed)) {
    // Bot returned an error object - this is unusual but we can handle it
    return { success: false, error: parsed };
  }

  const validation = validateBotResponse(parsed);
  if (!validation.valid) {
    return { success: false, error: validation.error! };
  }

  return { success: true, response: { move: validation.move! } };
}

/**
 * Convert engine Piece to BotPiece
 */
export function pieceToBotPiece(piece: Piece): BotPiece {
  return {
    id: piece.id,
    type: piece.type,
    player: piece.player,
    pos: posToAlgebraic({ row: piece.row, col: piece.col }),
  };
}

/**
 * Convert engine MoveOption to BotMoveOption
 */
export function moveOptionToBotMoveOption(move: MoveOption): BotMoveOption {
  return {
    piece_id: move.pieceId,
    from: posToAlgebraic(move.from),
    to: posToAlgebraic(move.to),
    captures: move.captures,
  };
}

/**
 * Construct a BotRequest from GameEngine state
 */
export function constructBotRequest(
  matchId: string,
  state: GameState,
  legalMoves: MoveOption[],
  ruleModifiers: { conversion: boolean } = { conversion: false },
): BotRequest {
  const pieces = state.pieces.map(pieceToBotPiece);
  const legal_moves = legalMoves.map(moveOptionToBotMoveOption);

  return {
    protocol_version: PROTOCOL_VERSION,
    match_id: matchId,
    turn: state.turn,
    player: state.currentPlayer,
    board_size: state.boardSize,
    pieces,
    legal_moves,
    rules: { conversion: Boolean(ruleModifiers.conversion) },
  };
}

/**
 * Convert BotMove to engine coordinates
 */
export function botMoveToCoords(move: BotMove): { pieceId: string; toRow: number; toCol: number } {
  const toPos = algebraicToPosSafe(move.to);
  return {
    pieceId: move.piece_id,
    toRow: toPos.row,
    toCol: toPos.col,
  };
}

function algebraicToPosSafe(alg: string): Position {
  const pos = algebraicToPos(alg);
  if (!pos) throw new Error(`Invalid algebraic notation: ${alg}`);
  return pos;
}

type Position = { row: number; col: number };
