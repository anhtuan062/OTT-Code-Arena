/**
 * Bot Executor - Child Process Executor
 *
 * Implementation using Node.js child_process with enhanced security.
 * This is the fallback executor when Docker is not available.
 * Provides improved security over direct spawn but is not a true sandbox.
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import type {
  BotExecutor,
  BotProcessConfig,
  BotRequestMessage,
  BotExecutionResult,
  BotExecutionError,
  BotErrorCode,
  ExecutionContext,
  ResourceLimits,
  ExecutorConfig,
} from './types.js';

const DEFAULT_CONFIG: ExecutorConfig = {
  defaultTimeoutMs: 2000,
  defaultMaxStdoutBytes: 1024 * 1024, // 1MB
  defaultMaxStderrBytes: 10 * 1024 * 1024, // 10MB
  allowedEnvVars: ['PATH', 'HOME', 'USER', 'TEMP', 'TMP', 'NODE_OPTIONS'],
  workingDirBase: process.cwd(),
};

interface RunningProcess {
  proc: ReturnType<typeof spawn>;
  executionId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  killed: boolean;
  resolved: boolean;
  stdout: string;
  stderr: string;
  startTime: number;
  stdoutLimit: number;
  stderrLimit: number;
  onClose: (code: number | null) => void;
  onError: (err: Error) => void;
}

export class ChildProcessExecutor implements BotExecutor {
  private config: ExecutorConfig;
  private runningProcesses: Map<string, RunningProcess> = new Map();

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getName(): string {
    return 'child-process';
  }

  getSupportedLimits(): ResourceLimits {
    return {
      maxCpuPercent: undefined, // Not enforceable with child_process
      maxMemoryBytes: undefined, // Not enforceable with child_process
      maxProcesses: undefined, // Not enforceable with child_process
      maxFileSizeBytes: undefined, // Not enforceable with child_process
      maxOpenFiles: undefined, // Not enforceable with child_process
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
    const executionId = context.executionId;
    const startTime = Date.now();

    // Build sanitized environment
    const env = this.buildSanitizedEnv(processConfig.env);

    // Determine working directory
    const workingDir = processConfig.workingDir
      ? processConfig.workingDir
      : this.config.workingDirBase;

    const proc = spawn(processConfig.command, processConfig.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workingDir,
      windowsHide: true, // Hide console window on Windows
    } as SpawnOptionsWithoutStdio);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;
    let killed = false;
    let resolved = false;

    const runningProcess: RunningProcess = {
      proc,
      executionId,
      timeoutId: null as any,
      killed: false,
      resolved: false,
      stdout: '',
      stderr: '',
      startTime,
      stdoutLimit: processConfig.maxStdoutBytes,
      stderrLimit: processConfig.maxStderrBytes,
      onClose: () => {},
      onError: () => {},
    };

    this.runningProcesses.set(executionId, runningProcess);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      timedOut = true;
      killed = true;
      runningProcess.killed = true;
      this.killProcessTree(proc);
    }, processConfig.timeoutMs);

    runningProcess.timeoutId = timeoutId;

    // Handle stdout with size limit
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (killed) return;
      const chunkStr = chunk.toString('utf-8');
      if (stdout.length + chunkStr.length > processConfig.maxStdoutBytes) {
        stdout += chunkStr.slice(0, processConfig.maxStdoutBytes - stdout.length);
        if (!killed) {
          killed = true;
          runningProcess.killed = true;
          this.killProcessTree(proc);
        }
      } else {
        stdout += chunkStr;
      }
    });

    // Handle stderr with size limit
    proc.stderr?.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString('utf-8');
      if (stderr.length + chunkStr.length > processConfig.maxStderrBytes) {
        stderr += chunkStr.slice(0, processConfig.maxStderrBytes - stderr.length);
      } else {
        stderr += chunkStr;
      }
    });

    // Write request to stdin
    const requestJson = JSON.stringify(request);
    proc.stdin?.write(requestJson);
    proc.stdin?.end();

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const onClose = (code: number | null) => {
        if (resolved) return;
        resolved = true;
        runningProcess.resolved = true;
        clearTimeout(timeoutId);
        exitCode = code ?? null;
        this.runningProcesses.delete(executionId);
        resolve();
      };

      const onError = (err: Error) => {
        if (resolved) return;
        resolved = true;
        runningProcess.resolved = true;
        clearTimeout(timeoutId);
        stderr += `Process error: ${err.message}\n`;
        exitCode = -1;
        this.runningProcesses.delete(executionId);
        resolve();
      };

      proc.on('close', onClose);
      proc.on('error', onError);
      runningProcess.onClose = onClose;
      runningProcess.onError = onError;
    });

    const durationMs = Date.now() - startTime;

    // Parse response
    if (timedOut) {
      return this.createErrorResult(
        'TIMEOUT',
        `Bot timed out after ${processConfig.timeoutMs}ms`,
        timedOut,
        exitCode,
        stdout,
        stderr,
        durationMs
      );
    }

    // If process was killed (e.g., due to stdout limit), treat as crash
    if (killed && !timedOut) {
      return this.createErrorResult(
        'RESOURCE_LIMIT_EXCEEDED',
        'Bot process was terminated due to resource limit',
        false,
        exitCode,
        stdout,
        stderr,
        durationMs
      );
    }

    if (exitCode !== 0) {
      return this.createErrorResult(
        'PROCESS_CRASHED',
        `Bot exited with code ${exitCode}`,
        false,
        exitCode,
        stdout,
        stderr,
        durationMs
      );
    }

    // Parse stdout as JSON
    let parsed: unknown;
    try {
      const firstLine = stdout.trim().split('\n')[0];
      if (!firstLine) {
        return this.createErrorResult(
          'EMPTY_OUTPUT',
          'Bot produced no output',
          false,
          exitCode,
          stdout,
          stderr,
          durationMs
        );
      }
      parsed = JSON.parse(firstLine);
    } catch (e) {
      return this.createErrorResult(
        'INVALID_JSON',
        'Bot output is not valid JSON',
        false,
        exitCode,
        stdout,
        stderr,
        durationMs,
        String(e)
      );
    }

    // Validate response structure
    const responseValidation = this.validateBotResponse(parsed);
    if (!responseValidation.valid) {
      return this.createErrorResult(
        responseValidation.error!.code,
        responseValidation.error!.message,
        false,
        exitCode,
        stdout,
        stderr,
        durationMs
      );
    }

    return {
      success: true,
      response: responseValidation.response,
      timedOut: false,
      exitCode,
      stdout,
      stderr,
      durationMs,
    };
  }

  async terminate(executionId: string): Promise<void> {
    const running = this.runningProcesses.get(executionId);
    if (!running) return;

    running.killed = true;
    this.killProcessTree(running.proc);
    clearTimeout(running.timeoutId);
    this.runningProcesses.delete(executionId);
  }

  private buildSanitizedEnv(botEnv?: Record<string, string>): Record<string, string> {
    const allowed = new Set(this.config.allowedEnvVars);
    const env: Record<string, string> = {};

    // Only pass explicitly allowed environment variables
    for (const key of allowed) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key]!;
      }
    }

    // Allow bot-specific env vars (prefixed with BOT_)
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('BOT_') && value !== undefined) {
        env[key] = value;
      }
    }

    // Merge bot-provided env (these take precedence)
    if (botEnv) {
      Object.assign(env, botEnv);
    }

    return env;
  }

  private killProcessTree(proc: ReturnType<typeof spawn>): void {
    if (proc.pid) {
      try {
        if (process.platform === 'win32') {
          // On Windows, use taskkill to kill process tree
          spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
        } else {
          // On Unix, kill the process group
          process.kill(-proc.pid, 'SIGKILL');
        }
      } catch {
        // Ignore errors - process may already be dead
        proc.kill('SIGKILL');
      }
    } else {
      proc.kill('SIGKILL');
    }
  }

  private validateBotResponse(parsed: unknown): { valid: boolean; response?: BotExecutionResult['response']; error?: BotExecutionError } {
    if (typeof parsed !== 'object' || parsed === null) {
      return { valid: false, error: { code: 'INVALID_RESPONSE', message: 'Response must be an object' } };
    }

    const obj = parsed as Record<string, unknown>;

    if (!('move' in obj)) {
      return { valid: false, error: { code: 'MISSING_MOVE', message: 'Response must contain a move object' } };
    }

    const move = obj.move;
    if (typeof move !== 'object' || move === null) {
      return { valid: false, error: { code: 'INVALID_MOVE', message: 'move must be an object' } };
    }

    const m = move as Record<string, unknown>;

    if (typeof m.piece_id !== 'string' || m.piece_id.length === 0) {
      return { valid: false, error: { code: 'INVALID_PIECE_ID', message: 'move.piece_id must be a non-empty string' } };
    }

    const from = m.from;
    const to = m.to;

    if (typeof from !== 'string' || from.length !== 2) {
      return { valid: false, error: { code: 'INVALID_FROM', message: 'move.from must be valid algebraic notation' } };
    }

    if (typeof to !== 'string' || to.length !== 2) {
      return { valid: false, error: { code: 'INVALID_TO', message: 'move.to must be valid algebraic notation' } };
    }

    const fromValid = /^[a-i][1-9]$/.test(from);
    const toValid = /^[a-i][1-9]$/.test(to);
    if (!fromValid || !toValid) {
      return { valid: false, error: { code: 'INVALID_COORDINATES', message: 'Coordinates must be a1-i9' } };
    }

    if (from === to) {
      return { valid: false, error: { code: 'INVALID_MOVE_SAME_SQUARE', message: 'move.from and move.to must be different' } };
    }

    return { valid: true, response: { move: { piece_id: m.piece_id, from, to } } };
  }

  private createErrorResult(
    code: BotErrorCode,
    message: string,
    timedOut: boolean,
    exitCode: number | null,
    stdout: string,
    stderr: string,
    durationMs: number,
    details?: unknown
  ): BotExecutionResult {
    return {
      success: false,
      error: { code, message, details },
      timedOut,
      exitCode,
      stdout,
      stderr,
      durationMs,
    };
  }
}

export function createChildProcessExecutor(config?: Partial<ExecutorConfig>): ChildProcessExecutor {
  return new ChildProcessExecutor(config);
}