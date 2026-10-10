/**
 * Bot Executor - BotRunner Adapter
 *
 * Adapts the legacy BotRunner to the BotExecutor interface.
 * This maintains backward compatibility while allowing migration to new executors.
 */

import { BotRunner } from '@bot-runner/index.js';
import type {
  BotExecutor,
  BotProcessConfig,
  BotRequestMessage,
  BotExecutionResult,
  BotExecutionError,
  BotErrorCode,
  ExecutionContext,
  ResourceLimits,
} from '@bot-executor/types.js';
import type { BotResult, BotError } from '@bot-runner/types.js';

export class BotRunnerAdapter implements BotExecutor {
  private botRunner: BotRunner;

  constructor(botRunner?: BotRunner) {
    this.botRunner = botRunner ?? new BotRunner();
  }

  getName(): string {
    return 'bot-runner-adapter';
  }

  getSupportedLimits(): ResourceLimits {
    return {
      maxCpuPercent: undefined,
      maxMemoryBytes: undefined,
      maxProcesses: undefined,
      maxFileSizeBytes: undefined,
      maxOpenFiles: undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(
    context: ExecutionContext,
    processConfig: BotProcessConfig,
    request: BotRequestMessage
  ): Promise<BotExecutionResult> {
    // Convert BotProcessConfig to BotRunner's format
    const botRunnerConfig = {
      botId: processConfig.botId,
      command: {
        command: processConfig.command,
        args: processConfig.args,
        env: processConfig.env,
      },
      timeoutMs: processConfig.timeoutMs,
      maxStdoutBytes: processConfig.maxStdoutBytes,
      maxStderrBytes: processConfig.maxStderrBytes,
    };

    const result: BotResult = await this.botRunner.runBot(botRunnerConfig, request);

    // Convert BotResult to BotExecutionResult
    return {
      success: result.success,
      response: result.response,
      error: result.error ? this.convertError(result.error) : undefined,
      exitCode: result.exitCode ?? null,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };
  }

  private convertError(error: BotError): BotExecutionError {
    // Map legacy error codes to new error codes
    const codeMap: Record<string, BotErrorCode> = {
      'TIMEOUT': 'TIMEOUT',
      'PROCESS_CRASHED': 'PROCESS_CRASHED',
      'INVALID_JSON': 'INVALID_JSON',
      'INVALID_RESPONSE': 'INVALID_RESPONSE',
      'MISSING_MOVE': 'MISSING_MOVE',
      'INVALID_MOVE': 'INVALID_MOVE',
      'INVALID_PIECE_ID': 'INVALID_PIECE_ID',
      'INVALID_FROM': 'INVALID_FROM',
      'INVALID_TO': 'INVALID_TO',
      'INVALID_COORDINATES': 'INVALID_COORDINATES',
      'INVALID_MOVE_SAME_SQUARE': 'INVALID_MOVE_SAME_SQUARE',
      'EMPTY_OUTPUT': 'EMPTY_OUTPUT',
    };
    const code = codeMap[error.code] || 'EXECUTOR_ERROR';
    return { code, message: error.message, details: error.details };
  }

  async terminate(executionId: string): Promise<void> {
    // BotRunner doesn't support termination of specific executions
    // This is a limitation of the legacy implementation
  }
}

export function createBotRunnerAdapter(botRunner?: BotRunner): BotRunnerAdapter {
  return new BotRunnerAdapter(botRunner);
}