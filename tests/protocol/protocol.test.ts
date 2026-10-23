/**
 * Bot Protocol - Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  constructBotRequest,
  parseBotResponse,
  validateBotRequest,
  validateBotResponse,
  pieceToBotPiece,
  moveOptionToBotMoveOption,
  botMoveToCoords,
  isValidAlgebraic,
  isValidPieceId,
  validateBotPiece,
  validateBotMoveOption,
} from '@bot-protocol/validation.js';
import { createInitialState, algebraicToPos, posToAlgebraic } from '@engine/state.js';
import { generateAllLegalMoves } from '@engine/moves.js';
import type { GameState, MoveOption, Piece } from '@engine/types.js';
import { GameEngine } from '@engine/index.js';

describe('Bot Protocol - Types and Validation', () => {
  let state: GameState;
  let legalMoves: MoveOption[];

  beforeEach(() => {
    state = createInitialState();
    legalMoves = generateAllLegalMoves(state);
  });

  describe('isValidAlgebraic', () => {
    it('should accept valid algebraic coordinates', () => {
      expect(isValidAlgebraic('a1')).toBe(true);
      expect(isValidAlgebraic('i9')).toBe(true);
      expect(isValidAlgebraic('e5')).toBe(true);
      expect(isValidAlgebraic('c1')).toBe(true);
    });

    it('should reject invalid algebraic coordinates', () => {
      expect(isValidAlgebraic('a0')).toBe(false);
      expect(isValidAlgebraic('j1')).toBe(false);
      expect(isValidAlgebraic('a10')).toBe(false);
      expect(isValidAlgebraic('z9')).toBe(false);
      expect(isValidAlgebraic('')).toBe(false);
      expect(isValidAlgebraic('a')).toBe(false);
      expect(isValidAlgebraic('aa')).toBe(false);
    });
  });

  describe('isValidPieceId', () => {
    it('should accept valid piece IDs', () => {
      expect(isValidPieceId('A-dam-1')).toBe(true);
      expect(isValidPieceId('B-keo-3')).toBe(true);
      expect(isValidPieceId('A-la-2')).toBe(true);
    });

    it('should reject invalid piece IDs', () => {
      expect(isValidPieceId('C-dam-1')).toBe(false);
      expect(isValidPieceId('A-king-1')).toBe(false);
      expect(isValidPieceId('A-dam')).toBe(false);
      expect(isValidPieceId('')).toBe(false);
    });
  });

  describe('validateBotPiece', () => {
    it('should accept valid piece', () => {
      const piece = { id: 'A-dam-1', type: 'dam', player: 'A', pos: 'c1' };
      expect(validateBotPiece(piece)).toBe(true);
    });

    it('should reject invalid piece', () => {
      expect(validateBotPiece({ id: 'A-dam-1', type: 'king', player: 'A', pos: 'c1' })).toBe(false);
      expect(validateBotPiece({ id: 'A-dam-1', type: 'dam', player: 'C', pos: 'c1' })).toBe(false);
      expect(validateBotPiece({ id: 'A-dam-1', type: 'dam', player: 'A', pos: 'z9' })).toBe(false);
      expect(validateBotPiece(null)).toBe(false);
    });
  });

  describe('validateBotMoveOption', () => {
    it('should accept valid move option', () => {
      const move = { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null };
      expect(validateBotMoveOption(move)).toBe(true);
    });

    it('should accept valid capture move option', () => {
      const move = { piece_id: 'A-dam-1', from: 'c1', to: 'd2', captures: 'B-keo-1' };
      expect(validateBotMoveOption(move)).toBe(true);
    });

    it('should reject invalid move option - same from and to', () => {
      expect(validateBotMoveOption({ piece_id: 'A-dam-1', from: 'c1', to: 'c1', captures: null })).toBe(true);
    });

    it('should reject invalid move option - invalid piece_id format', () => {
      expect(validateBotMoveOption({ piece_id: 'C-dam-1', from: 'c1', to: 'c2', captures: null })).toBe(false);
    });

    it('should reject invalid move option - invalid from coordinate', () => {
      expect(validateBotMoveOption({ piece_id: 'A-dam-1', from: 'z9', to: 'c2', captures: null })).toBe(false);
    });

    it('should reject invalid move option - invalid to coordinate', () => {
      expect(validateBotMoveOption({ piece_id: 'A-dam-1', from: 'c1', to: 'z9', captures: null })).toBe(false);
    });

    it('should reject invalid move option - invalid capture piece_id format', () => {
      expect(validateBotMoveOption({ piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: 'invalid' })).toBe(false);
    });

    it('should reject null', () => {
      expect(validateBotMoveOption(null)).toBe(false);
    });
  });

  describe('validateBotRequest', () => {
    it('should accept valid request', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      const result = validateBotRequest(request);
      expect(result.valid).toBe(true);
    });

    it('should reject request with wrong protocol version', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).protocol_version = '1.0.0';
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_VERSION');
    });

    it('should reject request with missing match_id', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).match_id = '';
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MATCH_ID');
    });

    it('should reject request with invalid turn', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).turn = 0;
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_TURN');
    });

    it('should reject request with invalid player', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).player = 'C';
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_PLAYER');
    });

    it('should reject request with invalid board_size', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).board_size = 8;
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_BOARD_SIZE');
    });

    it('should reject request with invalid pieces array', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).pieces = 'not an array';
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_PIECES');
    });

    it('should reject request with invalid piece in array', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).pieces = [{ id: 'invalid', type: 'dam', player: 'A', pos: 'c1' }];
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_PIECE');
    });

    it('should reject request with invalid legal_moves array', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      (request as Record<string, unknown>).legal_moves = 'not an array';
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_LEGAL_MOVES');
    });

    it('should reject request with legal move referencing unknown piece', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      // Use valid format but piece that doesn't exist in pieces array
      (request as Record<string, unknown>).legal_moves = [{ piece_id: 'A-dam-99', from: 'c1', to: 'c2', captures: null }];
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_LEGAL_MOVE_PIECE');
    });

    it('should reject request with legal move referencing unknown capture', () => {
      const request = constructBotRequest('match-123', state, legalMoves);
      const moves = [...legalMoves];
      if (moves.length > 0) {
        const move = moves[0];
        (request as Record<string, unknown>).legal_moves = [{
          piece_id: move.pieceId,
          from: posToAlgebraic(move.from),
          to: posToAlgebraic(move.to),
          captures: 'B-keo-99', // valid format but doesn't exist
        }];
      }
      const result = validateBotRequest(request);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_LEGAL_MOVE_CAPTURE');
    });
  });

  describe('validateBotResponse', () => {
    it('should accept valid response', () => {
      const response = { move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } };
      const result = validateBotResponse(response);
      expect(result.valid).toBe(true);
      expect(result.move).toEqual({ piece_id: 'A-dam-1', from: 'c1', to: 'c2' });
    });

    it('should reject response missing move', () => {
      const result = validateBotResponse({});
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('MISSING_MOVE');
    });

    it('should reject response with invalid move object', () => {
      const result = validateBotResponse({ move: 'not an object' });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE');
    });

    it('should reject response with invalid piece_id', () => {
      const result = validateBotResponse({ move: { piece_id: 'invalid', from: 'c1', to: 'c2' } });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_PIECE_ID');
    });

    it('should reject response with invalid from coordinate', () => {
      const result = validateBotResponse({ move: { piece_id: 'A-dam-1', from: 'z9', to: 'c2' } });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_FROM');
    });

    it('should reject response with invalid to coordinate', () => {
      const result = validateBotResponse({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'z9' } });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_TO');
    });

    it('should reject response with same from and to', () => {
      const result = validateBotResponse({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c1' } });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE_SAME_SQUARE');
    });

    it('should reject response with move distance > 1', () => {
      const result = validateBotResponse({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c3' } });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE_DISTANCE');
    });
  });

  describe('parseBotResponse', () => {
    it('should parse valid JSON response', () => {
      const json = JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } });
      const result = parseBotResponse(json);
      expect(result.success).toBe(true);
      expect(result.response).toEqual({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } });
    });

    it('should reject invalid JSON', () => {
      const result = parseBotResponse('not valid json');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_JSON');
    });

    it('should reject response that fails validation', () => {
      const json = JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c1' } });
      const result = parseBotResponse(json);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE_SAME_SQUARE');
    });
  });

  describe('pieceToBotPiece', () => {
    it('should convert engine piece to bot piece', () => {
      const piece: Piece = { id: 'A-dam-1', type: 'dam', player: 'A', row: 0, col: 2 };
      const botPiece = pieceToBotPiece(piece);
      expect(botPiece).toEqual({ id: 'A-dam-1', type: 'dam', player: 'A', pos: 'c1' });
    });
  });

  describe('moveOptionToBotMoveOption', () => {
    it('should convert engine move option to bot move option', () => {
      const move: MoveOption = {
        pieceId: 'A-dam-1',
        from: { row: 0, col: 2 },
        to: { row: 1, col: 2 },
        captures: null,
      };
      const botMove = moveOptionToBotMoveOption(move);
      expect(botMove).toEqual({ piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null });
    });

    it('should convert capture move option', () => {
      const move: MoveOption = {
        pieceId: 'A-dam-1',
        from: { row: 0, col: 2 },
        to: { row: 1, col: 3 },
        captures: 'B-keo-1',
      };
      const botMove = moveOptionToBotMoveOption(move);
      expect(botMove).toEqual({ piece_id: 'A-dam-1', from: 'c1', to: 'd2', captures: 'B-keo-1' });
    });
  });

  describe('botMoveToCoords', () => {
    it('should convert bot move to engine coordinates', () => {
      const move = { piece_id: 'A-dam-1', from: 'c1', to: 'c2' };
      const coords = botMoveToCoords(move);
      expect(coords).toEqual({ pieceId: 'A-dam-1', toRow: 1, toCol: 2 });
    });
  });

  describe('constructBotRequest', () => {
    it('should construct valid request from engine state', () => {
      const request = constructBotRequest('match-123', state, legalMoves);

      expect(request.protocol_version).toBe('0.1.0');
      expect(request.match_id).toBe('match-123');
      expect(request.turn).toBe(state.turn);
      expect(request.player).toBe(state.currentPlayer);
      expect(request.board_size).toBe(state.boardSize);
      expect(request.pieces).toHaveLength(state.pieces.length);
      expect(request.legal_moves).toHaveLength(legalMoves.length);

      // Verify all pieces converted correctly
      for (const piece of state.pieces) {
        const botPiece = request.pieces.find(p => p.id === piece.id);
        expect(botPiece).toBeDefined();
        expect(botPiece?.pos).toBe(posToAlgebraic({ row: piece.row, col: piece.col }));
      }

      // Verify all legal moves converted correctly
      for (const move of legalMoves) {
        const botMove = request.legal_moves.find(m => m.piece_id === move.pieceId && m.from === posToAlgebraic(move.from) && m.to === posToAlgebraic(move.to));
        expect(botMove).toBeDefined();
      }
    });

    it('should include captures in legal moves', () => {
      const request = constructBotRequest('match-123', state, legalMoves);

      for (const botMove of request.legal_moves) {
        const engineMove = legalMoves.find(m => m.pieceId === botMove.piece_id && posToAlgebraic(m.from) === botMove.from && posToAlgebraic(m.to) === botMove.to);
        expect(engineMove).toBeDefined();
        if (engineMove?.captures) {
          expect(botMove.captures).toBe(engineMove.captures);
        } else {
          expect(botMove.captures).toBeNull();
        }
      }
    });

    it('carries supported rule modifiers without deriving ownership from ids', () => {
      const request = constructBotRequest('match-conversion', state, legalMoves, { conversion: true });
      expect(request.rules).toEqual({ conversion: true });
      expect(validateBotRequest(request).valid).toBe(true);
      const convertedPiece = { ...request.pieces[0], id: 'B-dam-1', player: 'A' as const };
      expect(convertedPiece.player).toBe('A');
      expect(convertedPiece.id.startsWith('B-')).toBe(true);
    });
  });

  describe('Integration with GameEngine', () => {
    it('should work with GameEngine API', () => {
      const engine = new GameEngine();
      const state = engine.getState();
      const legalMoves = engine.getLegalMoves();

      const request = constructBotRequest('match-456', state, legalMoves);
      const validation = validateBotRequest(request);
      expect(validation.valid).toBe(true);

      // Simulate bot picking first legal move
      if (request.legal_moves.length > 0) {
        const botMove = request.legal_moves[0];
        const response = { move: { piece_id: botMove.piece_id, from: botMove.from, to: botMove.to } };

        const responseValidation = validateBotResponse(response);
        expect(responseValidation.valid).toBe(true);

        // Apply move using engine
        const coords = botMoveToCoords(responseValidation.move!);
        const result = engine.makeMove(coords.pieceId, coords.toRow, coords.toCol);
        expect(result.success).toBe(true);
      }
    });

    it('should handle multiple turns', () => {
      const engine = new GameEngine();

      for (let turn = 1; turn <= 5; turn++) {
        const state = engine.getState();
        if (engine.isFinished()) break;

        const legalMoves = engine.getLegalMoves();
        const request = constructBotRequest(`match-turn-${turn}`, state, legalMoves);

        expect(request.turn).toBe(turn);
        expect(request.player).toBe(state.currentPlayer);

        if (legalMoves.length > 0) {
          const botMove = legalMoves[0];
          engine.makeMove(botMove.pieceId, botMove.to.row, botMove.to.col);
        }
      }
    });
  });

  describe('Protocol version constant', () => {
    it('should export PROTOCOL_VERSION', async () => {
      const { PROTOCOL_VERSION } = await import('@bot-protocol/index.js');
      expect(PROTOCOL_VERSION).toBe('0.1.0');
    });
  });
});
