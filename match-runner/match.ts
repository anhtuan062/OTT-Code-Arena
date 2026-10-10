/**
 * Match Runner - Match Orchestration
 */

import { GameEngine } from '@engine/index.js';
import { constructBotRequest, botMoveToCoords } from '@bot-protocol/validation.js';
import { BotRunner, createBotProcessConfig } from '@bot-runner/index.js';
import { BotExecutor, BotRunnerAdapter } from '@bot-executor/index.js';
import {
  MatchConfig,
  BotDefinition,
  TurnLog,
  MatchResult,
  MatchReplay,
  MatchRunnerCallbacks,
  TerminationReason,
  Player,
  DEFAULT_MATCH_CONFIG,
} from './types.js';
import type { GameState, MoveOption, ApplyResult, GameConfig } from '@engine/types.js';
import type { BotError } from '@bot-protocol/types.js';
import type { BotRequestMessage } from '@bot-runner/types.js';
import type { BotProcessConfig, BotExecutionResult } from '@bot-executor/types.js';

export class MatchRunner {
  private config: MatchConfig;
  private engine: GameEngine;
  private botExecutor: BotExecutor;
  private playerA: BotDefinition;
  private playerB: BotDefinition;
  private turnLog: TurnLog[] = [];
  private startTime: Date;
  private endTime: Date | null = null;
  private callbacks: MatchRunnerCallbacks;
  private initialState: GameState;

  constructor(
    config: Partial<MatchConfig>,
    playerA: BotDefinition,
    playerB: BotDefinition,
    callbacks: MatchRunnerCallbacks = {},
    botExecutor?: BotExecutor
  ) {
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    this.playerA = playerA;
    this.playerB = playerB;
    this.callbacks = callbacks;

    // Initialize engine with config
    const engineConfig: Partial<GameConfig> = {
      maxTurns: this.config.maxTurns,
      turnTimeoutMs: this.config.turnTimeoutMs,
    };
    this.engine = new GameEngine(engineConfig);

    // Store the true initial state for replay
    this.initialState = this.engine.getState();

    // Initialize bot executor (use adapter for backward compatibility)
    this.botExecutor = botExecutor ?? new BotRunnerAdapter(
      new BotRunner({
        defaultTimeoutMs: this.config.turnTimeoutMs,
        defaultMaxStdoutBytes: this.config.maxStdoutBytes,
        defaultMaxStderrBytes: this.config.maxStderrBytes,
        failurePolicy: this.config.failurePolicy,
        maxRetries: this.config.maxRetries,
      })
    );

    this.startTime = new Date();
  }

  async run(): Promise<MatchResult> {
    let currentState = this.engine.getState();

    while (currentState.status !== 'finished') {
      const turn = currentState.turn;
      const currentPlayer = currentState.currentPlayer;

      this.callbacks.onTurnStart?.(turn, currentPlayer);

      // Check turn limit
      if (turn > this.config.maxTurns) {
        return this.finishMatch('turn_limit', null, currentState);
      }

      // Get legal moves
      const legalMoves = this.engine.getLegalMoves();

      // If no legal moves, check for win/draw
      if (legalMoves.length === 0) {
        const gameResult = this.engine.checkGameOver();
        if (gameResult.finished) {
          return this.finishMatch(gameResult.reason as TerminationReason, gameResult.winner, currentState);
        }
        // No legal moves but game not finished - treat as draw
        return this.finishMatch('insufficient_material', 'draw', currentState);
      }

      // Construct bot request
      const request = constructBotRequest(this.config.matchId, currentState, legalMoves);

      // Get bot process config
      const botDef = currentPlayer === 'A' ? this.playerA : this.playerB;
      const botProcessConfig: BotProcessConfig = {
        botId: botDef.botId,
        command: botDef.command,
        args: botDef.args,
        env: botDef.env,
        timeoutMs: this.config.turnTimeoutMs,
        maxStdoutBytes: this.config.maxStdoutBytes,
        maxStderrBytes: this.config.maxStderrBytes,
      };

      // Run bot using BotExecutor
      const executionId = `${this.config.matchId}-turn-${turn}-${currentPlayer}`;
      const executionContext = {
        executionId,
        matchId: this.config.matchId,
        turn,
        player: currentPlayer,
      };

      const botResult: BotExecutionResult = await this.botExecutor.execute(
        executionContext,
        botProcessConfig,
        request
      );

      // Build turn log
      const turnLog: TurnLog = {
        turn,
        player: currentPlayer,
        timestamp: new Date().toISOString(),
        request: this.config.logRequests ? request : undefined,
        response: this.config.logResponses ? botResult : undefined,
      };

      if (!botResult.success) {
        // Bot failed - handle according to policy
        turnLog.error = botResult.error;
        const terminationReason = this.mapBotErrorToTerminationReason(botResult.error?.code);
        const winner = currentPlayer === 'A' ? 'B' : 'A';
        return this.finishMatch(terminationReason, winner, currentState, turnLog);
      }

      // Validate move with engine
      const coords = botMoveToCoords(botResult.response!.move);
      const engineValidation = this.engine.validateMove(coords.pieceId, coords.toRow, coords.toCol);

      if (!engineValidation.valid) {
        // Illegal move
        const error: BotError = {
          code: 'ILLEGAL_MOVE',
          message: `Illegal move: ${engineValidation.reason}`,
          details: { move: botResult.response?.move, reason: engineValidation.reason },
        };
        turnLog.error = error;
        const terminationReason: TerminationReason = 'bot_illegal_move';
        const winner = currentPlayer === 'A' ? 'B' : 'A';
        return this.finishMatch(terminationReason, winner, currentState, turnLog);
      }

      // Find the matching legal move to get the correct source position
      const matchingLegalMove = legalMoves.find(
        m => m.pieceId === coords.pieceId && m.to.row === coords.toRow && m.to.col === coords.toCol
      );
      const fromPosition = matchingLegalMove ? matchingLegalMove.from : { row: coords.toRow, col: coords.toCol };

      // Apply move
      const applyResult = this.engine.makeMove(coords.pieceId, coords.toRow, coords.toCol);
      currentState = applyResult.state;

      turnLog.appliedMove = {
        pieceId: coords.pieceId,
        from: { row: fromPosition.row, col: fromPosition.col },
        to: { row: coords.toRow, col: coords.toCol },
        captures: applyResult.capturedPiece?.id ?? null,
      };
      turnLog.engineResult = applyResult;
      turnLog.resultingState = this.config.logStates ? { ...currentState } : undefined;

      this.turnLog.push(turnLog);
      this.callbacks.onTurnEnd?.(turnLog);

      // Check game over
      const gameResult = this.engine.checkGameOver();
      if (gameResult.finished) {
        return this.finishMatch(gameResult.reason as TerminationReason, gameResult.winner, currentState);
      }
    }

    // Should not reach here, but handle gracefully
    return this.finishMatch('unknown', null, currentState);
  }

  private mapBotErrorToTerminationReason(errorCode?: string): TerminationReason {
    switch (errorCode) {
      case 'TIMEOUT':
        return 'bot_timeout';
      case 'PROCESS_CRASHED':
        return 'bot_crash';
      case 'INVALID_JSON':
        return 'bot_invalid_json';
      case 'INVALID_RESPONSE':
      case 'MISSING_MOVE':
      case 'INVALID_MOVE':
      case 'INVALID_PIECE_ID':
      case 'INVALID_FROM':
      case 'INVALID_TO':
      case 'INVALID_COORDINATES':
      case 'INVALID_MOVE_SAME_SQUARE':
      case 'INVALID_MOVE_DISTANCE':
        return 'bot_invalid_response';
      case 'EMPTY_OUTPUT':
        return 'bot_empty_output';
      case 'EXECUTOR_UNAVAILABLE':
      case 'EXECUTOR_ERROR':
        return 'engine_error';
      case 'RESOURCE_LIMIT_EXCEEDED':
        return 'bot_crash'; // Treat resource limit as crash
      case 'SECURITY_VIOLATION':
        return 'bot_illegal_move'; // Treat security violation as illegal move
      default:
        return 'unknown';
    }
  }

  private finishMatch(
    reason: TerminationReason,
    winner: Player | 'draw' | null,
    finalState: GameState,
    lastTurnLog?: TurnLog
  ): MatchResult {
    if (lastTurnLog) {
      this.turnLog.push(lastTurnLog);
    }

    this.endTime = new Date();
    const durationMs = this.endTime.getTime() - this.startTime.getTime();

    const result: MatchResult = {
      matchId: this.config.matchId,
      protocolVersion: this.config.protocolVersion,
      status: 'finished',
      winner,
      terminationReason: reason,
      turnCount: this.turnLog.length,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      durationMs,
      playerA: this.playerA,
      playerB: this.playerB,
      finalState,
      initialState: this.initialState,
      turnLog: this.turnLog,
    };

    this.callbacks.onMatchEnd?.(result);
    return result;
  }

  getTurnLog(): TurnLog[] {
    return [...this.turnLog];
  }

  getEngine(): GameEngine {
    return this.engine;
  }

  getConfig(): MatchConfig {
    return { ...this.config };
  }

  // Create replay from match result
  static createReplay(result: MatchResult): MatchReplay {
    const moves = result.turnLog.map(log => ({
      turn: log.turn,
      player: log.player,
      pieceId: log.appliedMove?.pieceId ?? '',
      from: log.appliedMove?.from ?? { row: 0, col: 0 },
      to: log.appliedMove?.to ?? { row: 0, col: 0 },
      captures: log.appliedMove?.captures ?? null,
      timestamp: log.timestamp,
    }));

    return {
      matchId: result.matchId,
      protocolVersion: result.protocolVersion,
      initialState: result.initialState,
      moves,
      finalState: result.finalState,
      winner: result.winner,
      terminationReason: result.terminationReason,
    };
  }
}

export function createMatchRunner(
  config: Partial<MatchConfig>,
  playerA: BotDefinition,
  playerB: BotDefinition,
  callbacks?: MatchRunnerCallbacks,
  botExecutor?: BotExecutor
): MatchRunner {
  return new MatchRunner(config, playerA, playerB, callbacks, botExecutor);
}

export { DEFAULT_MATCH_CONFIG };