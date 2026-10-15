/**
 * OTTv2 Game Engine - Main Entry Point
 * Pure, deterministic game logic with no I/O dependencies
 */

export * from './types.js';
export * from './state.js';
export * from './moves.js';
export * from './apply.js';
export * from './win.js';
export * from './system-opponent.js';
export * from './initial-layout.js';

import { GameState, GameConfig, MoveOption, ApplyResult, ValidationResult, DEFAULT_CONFIG } from './types.js';
import { createInitialState, validateState, algebraicToPos, algebraicToPosSafe, posToAlgebraic, getPieceById } from './state.js';
import { generateLegalMovesForPiece, generateAllLegalMoves, validateMove, isMoveLegal } from './moves.js';
import { applyMove, applyMoveByCoords } from './apply.js';
import { checkWin, checkDraw, getGameResult } from './win.js';

/**
 * High-level engine API
 */
export class GameEngine {
  private state: GameState;
  private config: GameConfig;
  private positionHistory: string[] = [];

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = createInitialState(this.config);
    this.positionHistory.push(this.hashPosition());
  }

  getState(): GameState {
    return this.serializeState();
  }

  getConfig(): GameConfig {
    return this.config;
  }

  getCurrentPlayer(): 'A' | 'B' {
    return this.state.currentPlayer;
  }

  getTurn(): number {
    return this.state.turn;
  }

  getLegalMoves(): MoveOption[] {
    return generateAllLegalMoves(this.state);
  }

  getLegalMovesForPiece(pieceId: string): MoveOption[] {
    const piece = getPieceById(this.state, pieceId);
    if (!piece || piece.player !== this.state.currentPlayer) {
      return [];
    }
    return generateLegalMovesForPiece(this.state, pieceId);
  }

  validateMove(pieceId: string, toRow: number, toCol: number): ValidationResult {
    return validateMove(this.state, pieceId, toRow, toCol);
  }

  validateMoveAlgebraic(pieceId: string, toAlg: string): ValidationResult {
    const pos = algebraicToPos(toAlg);
    if (!pos) return { valid: false, reason: 'Invalid algebraic notation' };
    return this.validateMove(pieceId, pos.row, pos.col);
  }

  makeMove(pieceId: string, toRow: number, toCol: number): ApplyResult {
    const result = applyMoveByCoords(this.state, pieceId, toRow, toCol);
    if (result.success) {
      this.state = result.state;
      this.positionHistory.push(this.hashPosition());
    }
    return result;
  }

  makeMoveAlgebraic(pieceId: string, toAlg: string): ApplyResult {
    const pos = algebraicToPos(toAlg);
    if (!pos) return { success: false, state: this.state, capturedPiece: null, winReason: null };
    return this.makeMove(pieceId, pos.row, pos.col);
  }

  checkGameOver(): { finished: boolean; winner: 'A' | 'B' | 'draw' | null; reason: string | null } {
    return getGameResult(this.state, { maxTurns: this.config.maxTurns });
  }

  isFinished(): boolean {
    return this.state.status === 'finished';
  }

  getWinner(): 'A' | 'B' | null {
    return this.state.winner;
  }

  getWinReason(): string | null {
    return this.state.winReason;
  }

  getPositionHash(): string {
    return this.hashPosition();
  }

  getPositionHistory(): string[] {
    return [...this.positionHistory];
  }

  private hashPosition(): string {
    const pieces = [...this.state.pieces].sort((a, b) => a.id.localeCompare(b.id));
    const pieceStr = pieces.map(p => `${p.id}:${p.type}:${p.player}:${p.row}:${p.col}`).join(';');
    return `${this.state.currentPlayer}:${pieceStr}`;
  }

  // Utility for serialization
  serializeState(): GameState {
    return {
      ...this.state,
      pieces: this.state.pieces.map(p => ({ ...p })),
      lastMove: this.state.lastMove ? { ...this.state.lastMove } : null,
    };
  }

  // Create engine from existing state (for replay)
  static fromState(state: GameState, config: Partial<GameConfig> = {}): GameEngine {
    const engine = new GameEngine(config);
    engine.state = state;
    engine.positionHistory = [engine.hashPosition()];
    return engine;
  }
}

export function createEngine(config?: Partial<GameConfig>): GameEngine {
  return new GameEngine(config);
}

export function createInitialGameState(config?: Partial<GameConfig>): GameState {
  return createInitialState({ ...DEFAULT_CONFIG, ...config });
}

export { applyMoveByCoords } from './apply.js';
