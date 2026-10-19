/**
 * Match Runner - Match Orchestration
 */

import { GameEngine } from '@engine/index.js';
import { constructBotRequest, validateBotRequest, botMoveToCoords } from '@bot-protocol/validation.js';
import { BotRunner, createBotProcessConfig } from '@bot-runner/index.js';
import { BotExecutor, BotRunnerAdapter } from '@bot-executor/index.js';
import {
  MatchConfig,
  BotDefinition,
  TurnLog,
  MatchResult,
  MatchReplay,
  MatchRunnerCallbacks,
  LiveMatchSnapshot,
  TerminationReason,
  Player,
  ExecutionProvenance,
  DEFAULT_MATCH_CONFIG,
  sourceRevisionTurnTimeoutMs,
} from './types.js';
import type { GameState, MoveOption, ApplyResult, GameConfig } from '@engine/types.js';
import type { BotError } from '@bot-protocol/types.js';
import type { BotRequestMessage } from '@bot-runner/types.js';
import { ExecutionCancelledError } from '@bot-executor/types.js';
import type { BotProcessConfig, BotExecutionResult, SourceRevisionExecutor } from '@bot-executor/types.js';
import type { SourceRevisionExecution, ExecutionDiagnostic } from './types.js';
import { createHash } from 'node:crypto';

function createTurnExecutionId(matchId: string, turn: number, player: Player): string {
  const suffix = `-turn-${turn}-${player}`;
  const plain = `${matchId}${suffix}`;
  if (plain.length <= 128) return plain;
  // Docker/container identifiers are capped at 128 characters. Preserve a
  // stable match fingerprint plus the turn/player suffix so long tournament
  // match IDs continue working past turn 99.
  const fingerprint = createHash('sha256').update(matchId).digest('hex').slice(0, 32);
  return `m-${fingerprint}${suffix}`;
}

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
  private snapshotSequence = 0;
  private revisionExecutor?: SourceRevisionExecutor;
  private resolveRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>;

  constructor(
    config: Partial<MatchConfig>,
    playerA: BotDefinition,
    playerB: BotDefinition,
    callbacks: MatchRunnerCallbacks = {},
    botExecutor?: BotExecutor,
    revisionExecutor?: SourceRevisionExecutor,
    resolveRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>
  ) {
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    this.playerA = playerA;
    this.playerB = playerB;
    this.callbacks = callbacks;
    this.revisionExecutor = revisionExecutor;
    this.resolveRevision = resolveRevision;

    // Initialize engine with config
    const engineConfig: Partial<GameConfig> = {
      maxTurns: this.config.maxTurns,
      turnTimeoutMs: this.config.turnTimeoutMs,
      ...(this.config.initialPieces ? { initialPieces: this.config.initialPieces } : {}),
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

  async run(signal?: AbortSignal): Promise<MatchResult> {
    try {
      return await this.runMatch(signal);
    } finally {
      await this.revisionExecutor?.releaseRevisionScope?.(this.config.matchId);
    }
  }

  private async runMatch(signal?: AbortSignal): Promise<MatchResult> {
    let currentState = this.engine.getState();
    this.emitSnapshot('in_progress', currentState);

    while (currentState.status !== 'finished') {
      if (signal?.aborted) throw new ExecutionCancelledError();
      const turn = currentState.turn;
      const currentPlayer = currentState.currentPlayer;

      this.callbacks.onTurnStart?.(turn, currentPlayer);

      // Check turn limit
      if (turn > this.config.maxTurns) {
        // The engine's authoritative result contract classifies max turns as
        // a legitimate draw. Keep infrastructure/unknown null winners distinct.
        return this.finishMatch('turn_limit', 'draw', currentState);
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
      const requestValidation = validateBotRequest(request);
      if (!requestValidation.valid) {
        throw new Error(`Constructed bot request failed protocol validation: ${requestValidation.error?.message ?? 'unknown error'}`);
      }

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
      const executionId = createTurnExecutionId(this.config.matchId, turn, currentPlayer);
      const executionContext = {
        executionId,
        matchId: this.config.matchId,
        turn,
        player: currentPlayer,
        // Strategy source revisions run inside Docker. Give both C++ and
        // Python the same 5-second turn budget so runtime startup and SDK
        // loading do not cause avoidable timeouts.
        timeoutMs: botDef.execution?.kind === 'source-revision'
          ? sourceRevisionTurnTimeoutMs(this.config.turnTimeoutMs)
          : this.config.turnTimeoutMs,
        signal,
        revisionScopeId: this.config.matchId,
      };

      let botResult: BotExecutionResult;
      if (botDef.execution?.kind === 'source-revision') {
        if (!this.revisionExecutor || !this.resolveRevision) {
          throw new Error('Source-revision Docker capability is disabled');
        }
        const source = await this.resolveRevision(botDef.execution);
        if (!source) throw new Error('Pinned source revision could not be resolved');
        botResult = await this.revisionExecutor.executeRevision(executionContext, { execution: botDef.execution, source }, request);
        if (botResult.error?.code === 'EXECUTOR_UNAVAILABLE' || botResult.error?.code === 'EXECUTOR_ERROR' || botResult.error?.code === 'SANDBOX_REQUIRED') {
          throw new Error(botResult.error.message);
        }
      } else if (!botDef.execution || botDef.execution.kind === 'legacy-command') {
        botResult = await this.botExecutor.execute(executionContext, botProcessConfig, request);
      } else {
        throw new Error('Unknown bot execution kind');
      }
      if (signal?.aborted) throw new ExecutionCancelledError();

      // Build turn log
      const turnLog: TurnLog = {
        turn,
        player: currentPlayer,
        timestamp: new Date().toISOString(),
        request: this.config.logRequests ? request : undefined,
        response: this.config.logResponses ? botResult : undefined,
        executionDiagnostic: {
          player: currentPlayer,
          runtimeId: botDef.execution?.kind === 'source-revision' ? botDef.execution.runtimeId : 'legacy',
          executionMode: botDef.execution?.kind === 'source-revision' ? (botDef.execution.executionMode ?? 'raw') : 'legacy',
          ...(botDef.execution?.kind === 'source-revision' && botDef.execution.sdkVersion ? { sdkVersion: botDef.execution.sdkVersion } : {}),
          ...(botDef.execution?.kind === 'source-revision' && botDef.execution.sdkDigest ? { sdkDigest: botDef.execution.sdkDigest } : {}),
          ...(botResult.provenance?.compilationBackend ? { compilationBackend: botResult.provenance.compilationBackend } : {}),
          ...(botResult.provenance?.compilerImageDigest ? { compilerImageDigest: botResult.provenance.compilerImageDigest } : {}),
          ...(botResult.provenance?.compilerConfigDigest ? { compilerConfigDigest: botResult.provenance.compilerConfigDigest } : {}),
          ...(botResult.provenance?.artifactDigest ? { artifactDigest: botResult.provenance.artifactDigest } : {}),
          ...(botResult.error?.stage ? { failureStage: botResult.error.stage } : {}),
          ...(botResult.error?.code ? { errorCode: botResult.error.code } : {}),
          exitCode: botResult.exitCode,
          outputProduced: botResult.stdout.length > 0 || botResult.stderr.length > 0,
          engineAcceptedMove: false,
        },
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
      turnLog.executionDiagnostic!.engineAcceptedMove = true;

      turnLog.appliedMove = {
        pieceId: coords.pieceId,
        from: { row: fromPosition.row, col: fromPosition.col },
        to: { row: coords.toRow, col: coords.toCol },
        captures: applyResult.capturedPiece?.id ?? null,
      };
      turnLog.engineResult = applyResult;
      turnLog.resultingState = this.config.logStates ? { ...currentState } : undefined;

      this.turnLog.push(turnLog);
      this.emitSnapshot('in_progress', currentState, turnLog.appliedMove ?? null);
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
      case 'COMPILATION_TIMEOUT':
      case 'RUNTIME_TIMEOUT':
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
      metadata: this.getExecutionMetadata(),
    };

    this.emitSnapshot('finished', finalState, lastTurnLog?.appliedMove ?? this.turnLog.at(-1)?.appliedMove ?? null);

    this.callbacks.onMatchEnd?.(result);
    return result;
  }

  private getExecutionMetadata(): Record<string, unknown> | undefined {
    const sourceRevisions: ExecutionProvenance[] = [
      { player: 'A' as Player, execution: this.playerA.execution },
      { player: 'B' as Player, execution: this.playerB.execution },
    ].flatMap(({ player, execution }) => execution?.kind === 'source-revision' ? [{
      player,
      competitorId: execution.competitorId,
      botId: execution.botId,
      revisionId: execution.revisionId,
      runtimeId: execution.runtimeId,
      sourceDigest: execution.sourceDigest,
      executionMode: execution.executionMode,
      sdkVersion: execution.sdkVersion,
      sdkDigest: execution.sdkDigest,
    }] : []);
    const executionDiagnostics = this.turnLog
      .map(turn => turn.executionDiagnostic)
      .filter((diagnostic): diagnostic is ExecutionDiagnostic => Boolean(diagnostic));
    return sourceRevisions.length > 0 || executionDiagnostics.length > 0
      ? { sourceRevisions, executionDiagnostics }
      : undefined;
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

  private emitSnapshot(
    status: LiveMatchSnapshot['status'],
    state: GameState,
    latestMove: TurnLog['appliedMove'] | null = null,
    error?: string,
  ): void {
    if (!this.callbacks.onSnapshot) return;
    const snapshot: LiveMatchSnapshot = {
      matchId: this.config.matchId,
      status,
      sequence: ++this.snapshotSequence,
      turn: state.turn,
      currentPlayer: state.currentPlayer,
      state: {
        ...state,
        pieces: state.pieces.map(piece => ({ ...piece })),
        lastMove: state.lastMove ? { ...state.lastMove, from: { ...state.lastMove.from }, to: { ...state.lastMove.to } } : null,
      },
      latestMove: latestMove ? { ...latestMove, from: { ...latestMove.from }, to: { ...latestMove.to } } : null,
      updatedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
    try { this.callbacks.onSnapshot(snapshot); } catch { /* observers cannot affect match execution */ }
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
      metadata: result.metadata as MatchReplay['metadata'],
    };
  }
}

export function createMatchRunner(
  config: Partial<MatchConfig>,
  playerA: BotDefinition,
  playerB: BotDefinition,
  callbacks?: MatchRunnerCallbacks,
  botExecutor?: BotExecutor,
  revisionExecutor?: SourceRevisionExecutor,
  resolveRevision?: (execution: SourceRevisionExecution) => Promise<Buffer | null>
): MatchRunner {
  return new MatchRunner(config, playerA, playerB, callbacks, botExecutor, revisionExecutor, resolveRevision);
}

export { DEFAULT_MATCH_CONFIG };
