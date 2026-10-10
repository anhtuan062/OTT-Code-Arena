/**
 * Bot Protocol - Main Entry Point
 * Version: 0.1.0
 */

export * from './types.js';
export * from './validation.js';

import { PROTOCOL_VERSION } from './types.js';
import { constructBotRequest, parseBotResponse, botMoveToCoords } from './validation.js';
import type { BotRequest, BotResponse, BotMove, BotError, ProtocolVersion } from './types.js';
import type { GameState, MoveOption } from '../engine/types.js';

export { PROTOCOL_VERSION };

/**
 * High-level protocol API
 */
export class BotProtocol {
  /**
   * Create a bot request from engine state
   */
  static createRequest(matchId: string, state: GameState, legalMoves: MoveOption[]): BotRequest {
    return constructBotRequest(matchId, state, legalMoves);
  }

  /**
   * Parse and validate a bot response from JSON string
   */
  static parseResponse(jsonString: string): { success: true; response: BotResponse } | { success: false; error: BotError } {
    const result = parseBotResponse(jsonString);
    if (result.success) {
      return { success: true, response: result.response! };
    }
    return { success: false, error: result.error! };
  }

  /**
   * Convert bot move to engine coordinates
   */
  static toEngineCoords(move: BotMove): { pieceId: string; toRow: number; toCol: number } {
    return botMoveToCoords(move);
  }

  /**
   * Get protocol version
   */
  static getVersion(): ProtocolVersion {
    return PROTOCOL_VERSION;
  }
}

export function createBotRequest(matchId: string, state: GameState, legalMoves: MoveOption[]): BotRequest {
  return BotProtocol.createRequest(matchId, state, legalMoves);
}

export function parseBotResponseSafe(jsonString: string): { success: true; response: BotResponse } | { success: false; error: BotError } {
  return BotProtocol.parseResponse(jsonString);
}