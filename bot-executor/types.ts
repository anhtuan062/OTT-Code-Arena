/**
 * Bot Executor - Types
 *
 * Defines the interface for executing bot processes with security isolation.
 */

import type { BotDefinition, MatchConfig } from '@match-runner/types.js';
import type { SourceRevisionExecution } from '@match-runner/types.js';
import type { BotRequestMessage } from '@bot-runner/types.js';

export type { BotRequestMessage };

/** Host-observed phase timings; docker run includes container startup. */
export interface RevisionExecutionTimings {
  imageReadinessMs: number;
  workspacePreparationMs: number | null;
  compilationContainerMs: number | null;
  artifactValidationMs: number | null;
  runtimeContainerMs: number | null;
  // Attached docker run cannot distinguish these two intervals reliably.
  runtimeStartupMs: null;
  botExecutionMs: null;
  cleanupMs: number;
  cleanupSucceeded: boolean;
  totalMs: number;
  preparationBudgetMs: number;
  compileBudgetMs: number;
  runtimeBudgetMs: number;
  timeoutPhase: 'preparation' | 'compilation' | 'runtime' | null;
}

export type CppCompilationBackend = 'bind' | 'ephemeral-volume';

/** Bounded provenance safe for authorized diagnostics and persisted replays. */
export interface RevisionExecutionProvenance {
  compilationBackend: CppCompilationBackend;
  sourceDigest: string;
  sdkVersion?: string;
  sdkDigest?: string;
  compilerImageDigest?: string;
  compilerConfigDigest?: string;
  artifactDigest?: string;
}

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
  timings?: RevisionExecutionTimings;
  provenance?: RevisionExecutionProvenance;
}

/**
 * Error from bot execution
 */
export interface BotExecutionError {
  code: BotErrorCode;
  message: string;
  details?: unknown;
  /** Bounded, non-sensitive stage for authorized diagnostics. */
  stage?: BotFailureStage;
}

export type BotFailureStage =
  | 'sdk_resolution'
  | 'source_integrity'
  | 'workspace_preparation'
  | 'workspace_preparation_timeout'
  | 'artifact_validation'
  | 'compilation'
  | 'docker_infrastructure'
  | 'runtime_startup'
  | 'timeout'
  | 'compilation_timeout'
  | 'runtime_timeout'
  | 'resource_limit'
  | 'protocol_parsing'
  | 'move_validation';

/**
 * Error codes for bot execution
 */
export type BotErrorCode =
  | 'TIMEOUT'
  | 'COMPILATION_TIMEOUT'
  | 'RUNTIME_TIMEOUT'
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
  /** Optional per-runtime budget. When omitted, the executor default is used. */
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;
  signal?: AbortSignal;
  /** Keeps a prepared source artifact alive only for this match/session. */
  revisionScopeId?: string;
}

export class ExecutionCancelledError extends Error {
  constructor(message = 'Execution cancelled') {
    super(message);
    this.name = 'ExecutionCancelledError';
  }
}

export function isExecutionCancelledError(error: unknown): error is ExecutionCancelledError {
  return error instanceof ExecutionCancelledError;
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

/** Optional capability implemented only by the dedicated source adapter. */
export interface SourceRevisionExecutor {
  executeRevision(
    context: ExecutionContext,
    revision: { execution: SourceRevisionExecution; source: Buffer },
    request: BotRequestMessage
  ): Promise<BotExecutionResult>;

  /** Release artifacts retained for a completed match/session. */
  releaseRevisionScope?(scopeId: string): Promise<boolean>;
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
