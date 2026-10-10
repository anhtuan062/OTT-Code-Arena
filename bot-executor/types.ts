/**
 * Bot Executor - Types
 *
 * Defines the interface for executing bot processes with security isolation.
 */

import type { BotDefinition, MatchConfig } from '@match-runner/types.js';
import type { BotRequestMessage } from '@bot-runner/types.js';

export type { BotRequestMessage };

/**
 * Result of a bot execution
 */
export interface BotExecutionResult {
  success: boolean;
  response?: {
    move: {
      piece_id: string;
      from: string;
      to: string;
    };
  };
  error?: BotExecutionError;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Error from bot execution
 */
export interface BotExecutionError {
  code: BotErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Error codes for bot execution
 */
export type BotErrorCode =
  | 'TIMEOUT'
  | 'PROCESS_CRASHED'
  | 'INVALID_JSON'
  | 'INVALID_RESPONSE'
  | 'MISSING_MOVE'
  | 'INVALID_MOVE'
  | 'INVALID_PIECE_ID'
  | 'INVALID_FROM'
  | 'INVALID_TO'
  | 'INVALID_COORDINATES'
  | 'INVALID_MOVE_SAME_SQUARE'
  | 'EMPTY_OUTPUT'
  | 'EXECUTOR_UNAVAILABLE'
  | 'EXECUTOR_ERROR'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'SECURITY_VIOLATION'
  | 'SANDBOX_REQUIRED';

/**
 * Configuration for bot process execution
 */
export interface BotProcessConfig {
  botId: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  workingDir?: string;
}

/**
 * Resource limits for bot execution
 */
export interface ResourceLimits {
  maxCpuPercent?: number;
  maxMemoryBytes?: number;
  maxProcesses?: number;
  maxFileSizeBytes?: number;
  maxOpenFiles?: number;
}

/**
 * Execution context passed to executor
 */
export interface ExecutionContext {
  executionId: string;
  matchId: string;
  turn: number;
  player: 'A' | 'B';
  resourceLimits?: ResourceLimits;
}

/**
 * Interface for bot executors
 */
export interface BotExecutor {
  /**
   * Execute a bot for a single turn
   */
  execute(
    context: ExecutionContext,
    processConfig: BotProcessConfig,
    request: BotRequestMessage
  ): Promise<BotExecutionResult>;

  /**
   * Terminate a running execution
   */
  terminate(executionId: string): Promise<void>;

  /**
   * Check if executor is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get executor name/identifier
   */
  getName(): string;

  /**
   * Get supported resource limits
   */
  getSupportedLimits(): ResourceLimits;
}

/**
 * Execution security policy
 */
export type ExecutionPolicy = 'development' | 'sandbox-required';

/**
 * Configuration for creating executors
 */
export interface ExecutorConfig {
  defaultTimeoutMs: number;
  defaultMaxStdoutBytes: number;
  defaultMaxStderrBytes: number;
  allowedEnvVars?: string[];
  workingDirBase?: string;
  executionPolicy?: ExecutionPolicy;
}

export interface DockerExecutorConfig extends ExecutorConfig {
  image: string;
  dockerBinary?: string;
  networkMode?: string;
  memoryLimit?: string;
  cpuLimit?: number;
  pidsLimit?: number;
}