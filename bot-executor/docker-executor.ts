/**
 * Bot Executor - Docker Executor
 *
 * Implementation using Docker containers for true isolation.
 * Requires Docker to be installed and running.
 * This is a stub implementation - Docker is not available in this environment.
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
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
import { ExecutionCancelledError } from './types.js';
import { validateDockerImage } from './image-config.js';
import { DockerExecutionLimiter, globalDockerExecutionLimiter } from './docker-execution-limiter.js';

interface DockerExecutorConfig extends ExecutorConfig {
  image: string;
  dockerBinary?: string;
  networkMode?: string;
  memoryLimit?: string;
  cpuLimit?: number;
  pidsLimit?: number;
  dockerExecutionLimiter?: DockerExecutionLimiter;
}

interface RunningContainer {
  containerId: string;
  executionId: string;
  process: ChildProcess;
  tempDir: string;
  timeoutId: ReturnType<typeof setTimeout>;
  killed: boolean;
  resolved: boolean;
  terminationPromise: Promise<void> | null;
  stdout: string;
  stderr: string;
  startTime: number;
}

export class DockerExecutor implements BotExecutor {
  private config: DockerExecutorConfig;
  private runningContainers: Map<string, RunningContainer> = new Map();
  private startingExecutions = new Set<string>();
  private pendingTerminations = new Set<string>();
  private dockerAvailable: boolean = false;
  private readonly dockerExecutionLimiter: DockerExecutionLimiter;

  constructor(config: Partial<DockerExecutorConfig> = {}) {
    this.config = {
      defaultTimeoutMs: 2000,
      defaultMaxStdoutBytes: 1024 * 1024,
      defaultMaxStderrBytes: 10 * 1024 * 1024,
      allowedEnvVars: ['PATH', 'HOME', 'USER', 'TEMP', 'TMP', 'NODE_OPTIONS'],
      workingDirBase: process.cwd(),
      // Direct construction is kept non-throwing for diagnostics/tests; execution
      // availability rejects an empty image. Factory creation validates eagerly.
      image: config.image ?? process.env.BOT_DOCKER_IMAGE ?? '',
      dockerBinary: 'docker',
      networkMode: 'none',
      memoryLimit: '256m',
      cpuLimit: 1,
      pidsLimit: 64,
      ...config,
    };
    this.dockerExecutionLimiter = config.dockerExecutionLimiter ?? globalDockerExecutionLimiter;
  }

  getName(): string {
    return 'docker';
  }

  getSupportedLimits(): ResourceLimits {
    return {
      maxCpuPercent: this.config.cpuLimit ? this.config.cpuLimit * 100 : undefined,
      maxMemoryBytes: this.config.memoryLimit ? this.parseMemoryLimit(this.config.memoryLimit) : undefined,
      maxProcesses: this.config.pidsLimit,
      maxFileSizeBytes: undefined, // Would need tmpfs with size limit
      maxOpenFiles: undefined, // Would need ulimit in container
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this.dockerAvailable) return true;

    try {
      validateDockerImage(this.config.image, this.config.executionPolicy);
      await this.runDockerCommand(['version', '--format', '{{.Server.Version}}']);
      // A reachable daemon alone is insufficient: fail before executing when the
      // selected immutable/local image is absent rather than allowing Docker pull policy.
      await this.runDockerCommand(['image', 'inspect', this.config.image]);
      this.dockerAvailable = true;
      return true;
    } catch {
      this.dockerAvailable = false;
      return false;
    }
  }

  async execute(
    context: ExecutionContext,
    processConfig: BotProcessConfig,
    request: BotRequestMessage
  ): Promise<BotExecutionResult> {
    if (context.signal?.aborted) {
      throw new ExecutionCancelledError();
    }
    if (!isSafeExecutionId(context.executionId)) {
      return this.createErrorResult(
        'SECURITY_VIOLATION',
        'Execution identifier contains unsupported characters',
        false,
        null,
        '',
        '',
        0
      );
    }
    const executionId = context.executionId;
    this.startingExecutions.add(executionId);
    const available = await this.isAvailable();
    if (!available) {
      this.startingExecutions.delete(executionId);
      this.pendingTerminations.delete(executionId);
      return this.createErrorResult(
        'EXECUTOR_UNAVAILABLE',
        'Docker is not available',
        false,
        null,
        '',
        '',
        0
      );
    }
    if (context.signal?.aborted) {
      this.startingExecutions.delete(executionId);
      this.pendingTerminations.delete(executionId);
      throw new ExecutionCancelledError();
    }

    const startTime = Date.now();

    // Create a temporary directory for this execution
    const tempDir = path.join(this.config.workingDirBase!, 'tmp', `exec-${executionId}`);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;
    let killed = false;
    let resolved = false;
    const requestJson = JSON.stringify(request);
    let runningContainer: RunningContainer | null = null;
    let cancelled = false;
    let releasePermit: (() => void) | null = null;
    const abortHandler = () => {
      cancelled = true;
      if (runningContainer) void this.terminateRunningContainer(runningContainer);
    };
    context.signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      await fs.mkdir(tempDir, { recursive: true });
      if (cancelled || context.signal?.aborted) throw new ExecutionCancelledError();
      await fs.writeFile(path.join(tempDir, 'request.json'), requestJson, 'utf8');
      if (cancelled || context.signal?.aborted) throw new ExecutionCancelledError();

      const dockerArgs = this.buildDockerArgs(executionId, processConfig, tempDir, requestJson);
      try {
        releasePermit = await this.dockerExecutionLimiter.acquire(context.signal, `generic:${executionId}`);
      } catch (error) {
        this.startingExecutions.delete(executionId);
        this.pendingTerminations.delete(executionId);
        if (context.signal?.aborted) throw new ExecutionCancelledError();
        throw error;
      }
      let proc: ReturnType<typeof spawn>;
      try {
        proc = spawn(this.config.dockerBinary!, dockerArgs, {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        } as SpawnOptionsWithoutStdio);
      } catch (error) {
        releasePermit();
        throw error;
      }

      runningContainer = {
        containerId: `ott-bot-${executionId}`,
        executionId,
        process: proc,
        tempDir,
        timeoutId: null as any,
        killed: false,
        resolved: false,
        terminationPromise: null,
        stdout: '',
        stderr: '',
        startTime,
      };
      this.runningContainers.set(executionId, runningContainer);
      this.startingExecutions.delete(executionId);
      if (cancelled || context.signal?.aborted || this.pendingTerminations.delete(executionId)) {
        await this.terminateRunningContainer(runningContainer);
      }

      const timeoutId = setTimeout(() => {
        if (resolved || !runningContainer) return;
        timedOut = true;
        void this.terminateRunningContainer(runningContainer);
      }, processConfig.timeoutMs);
      runningContainer.timeoutId = timeoutId;

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (killed || runningContainer?.killed) return;
        const chunkStr = chunk.toString('utf-8');
        if (stdout.length + chunkStr.length > processConfig.maxStdoutBytes) {
          stdout += chunkStr.slice(0, processConfig.maxStdoutBytes - stdout.length);
          killed = true;
          void this.terminateRunningContainer(runningContainer!);
        } else {
          stdout += chunkStr;
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString('utf-8');
        stderr = stderr.length + chunkStr.length > processConfig.maxStderrBytes
          ? stderr + chunkStr.slice(0, processConfig.maxStderrBytes - stderr.length)
          : stderr + chunkStr;
      });

      await new Promise<void>((resolve) => {
        const finish = (code: number | null, error?: Error) => {
          if (resolved) return;
          resolved = true;
          runningContainer!.resolved = true;
          clearTimeout(timeoutId);
          if (error) stderr += `Docker error: ${error.message}\n`;
          exitCode = error ? -1 : code;
          this.runningContainers.delete(executionId);
          resolve();
        };
        proc.once('close', code => finish(code));
        proc.once('error', error => finish(-1, error));
      });
      // Cleanup invokes docker kill/rm independently; do not hold the
      // execution permit while waiting for those commands.
      releasePermit?.();
      releasePermit = null;
    } finally {
      this.startingExecutions.delete(executionId);
      this.pendingTerminations.delete(executionId);
      releasePermit?.();
      releasePermit = null;
      context.signal?.removeEventListener('abort', abortHandler);
      if (runningContainer) {
        clearTimeout(runningContainer.timeoutId);
        await this.removeContainer(runningContainer.containerId);
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    if (cancelled || context.signal?.aborted) {
      throw new ExecutionCancelledError();
    }

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

    if (killed && !timedOut) {
      return this.createErrorResult(
        'RESOURCE_LIMIT_EXCEEDED',
        'Bot container was terminated due to resource limit',
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
        `Bot container exited with code ${exitCode}`,
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
    const running = this.runningContainers.get(executionId);
    if (!running) {
      if (this.startingExecutions.has(executionId)) {
        this.pendingTerminations.add(executionId);
      }
      return;
    }

    await this.terminateRunningContainer(running);
  }

  private buildDockerArgs(
    executionId: string,
    processConfig: BotProcessConfig,
    tempDir: string,
    requestJson: string
  ): string[] {
    const args = [
      'run',
      '--rm',
      '--name', `ott-bot-${executionId}`,
      '--network', this.config.networkMode!,
      '--memory', this.config.memoryLimit!,
      '--cpus', String(this.config.cpuLimit!),
      '--pids-limit', String(this.config.pidsLimit!),
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=10m',
      '--security-opt', 'no-new-privileges:true',
      '--cap-drop', 'ALL',
      '-w', '/app',
      '-v', `${tempDir}:/app/input:ro`,
      this.config.image,
    ];

    // The container should read stdin from /app/input/request.json
    // and write response to stdout
    // This assumes the container has an entrypoint that handles this
    const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
    args.push(
      'sh',
      '-c',
      `cat /app/input/request.json | ${[processConfig.command, ...processConfig.args].map(shellQuote).join(' ')}`
    );

    return args;
  }

  private async terminateRunningContainer(running: RunningContainer): Promise<void> {
    if (running.terminationPromise) return running.terminationPromise;

    running.killed = true;
    clearTimeout(running.timeoutId);
    running.terminationPromise = (async () => {
      await this.killContainer(running.containerId);
      // Docker Desktop can stop the container while leaving the parent
      // `docker run` CLI process waiting. Stop that process as well so the
      // execution promise observes its close event and cleanup can finish.
      if (!running.resolved) {
        running.process.kill();
      }
    })();
    return running.terminationPromise;
  }

  private killContainer(containerId: string): Promise<boolean> {
    if (!containerId) return Promise.resolve(false);

    return new Promise(resolve => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        resolve(success);
      };
      let killProcess: ChildProcess;
      try {
        killProcess = spawn(this.config.dockerBinary!, ['kill', containerId], { stdio: 'ignore' });
      } catch {
        finish(false);
        return;
      }
      killProcess.once('error', () => finish(false));
      killProcess.once('close', code => finish(code === 0));
    });
  }

  private removeContainer(containerId: string): Promise<void> {
    return new Promise(resolve => {
      let settled = false;
      const deadline = Date.now() + 10000;
      let retryId: ReturnType<typeof setTimeout> | undefined;
      let removeProcess: ChildProcess | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (retryId) clearTimeout(retryId);
        resolve();
      };
      const attempt = () => {
        if (settled) return;
        try {
          removeProcess = spawn(this.config.dockerBinary!, ['rm', '--force', containerId], { stdio: 'ignore' });
        } catch {
          finish();
          return;
        }
        removeProcess.once('error', () => {
          if (Date.now() >= deadline) finish();
          else retryId = setTimeout(attempt, 100);
        });
        removeProcess.once('close', code => {
          if (code === 0 || Date.now() >= deadline) finish();
          else retryId = setTimeout(attempt, 100);
        });
      };
      retryId = setTimeout(() => {
        if (removeProcess && !removeProcess.killed) removeProcess.kill();
        finish();
      }, 10000);
      attempt();
    });
  }

  private parseMemoryLimit(limit: string): number | undefined {
    const match = limit.match(/^(\d+)([kmg]?)$/i);
    if (!match || !match[1]) return undefined;

    const value = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase() ?? '';

    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private async runDockerCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.dockerBinary!, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Docker command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
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

export function isSafeExecutionId(executionId: string): boolean {
  return executionId.length > 0
    && executionId.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(executionId);
}

export function createDockerExecutor(config?: Partial<DockerExecutorConfig>): DockerExecutor {
  return new DockerExecutor(config);
}
