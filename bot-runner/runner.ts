/**
 * Bot Runner - Process Execution
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import type {
  BotProcessConfig,
  BotRequestMessage,
  BotResponseMessage,
  BotResult,
  BotError,
  BotRunnerConfig,
  BotFailurePolicy,
} from './types.js';

const DEFAULT_CONFIG: BotRunnerConfig = {
  defaultTimeoutMs: 2000,
  defaultMaxStdoutBytes: 1024 * 1024, // 1MB
  defaultMaxStderrBytes: 10 * 1024 * 1024, // 10MB
  failurePolicy: 'forfeit',
  maxRetries: 0,
};

export class BotRunner {
  private config: BotRunnerConfig;

  constructor(config: Partial<BotRunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async runBot(processConfig: BotProcessConfig, request: BotRequestMessage): Promise<BotResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;
    let killed = false;
    let resolved = false;

    const proc = spawn(processConfig.command.command, processConfig.command.args, {
      env: { ...process.env, ...processConfig.command.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    } as SpawnOptionsWithoutStdio);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      timedOut = true;
      killed = true;
      proc.kill('SIGKILL');
      // Don't set resolved=true here - let the close handler do it
    }, processConfig.timeoutMs);

    // Handle stdout with size limit
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (killed) return;
      const chunkStr = chunk.toString('utf-8');
      if (stdout.length + chunkStr.length > processConfig.maxStdoutBytes) {
        stdout += chunkStr.slice(0, processConfig.maxStdoutBytes - stdout.length);
        if (!killed) {
          killed = true;
          proc.kill('SIGKILL');
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
        clearTimeout(timeoutId);
        exitCode = code ?? null;
        resolve();
      };

      const onError = (err: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        // Process failed to start or encountered an error
        stderr += `Process error: ${err.message}\n`;
        exitCode = -1;
        resolve();
      };

      proc.on('close', onClose);
      proc.on('error', onError);
    });

    const durationMs = Date.now() - startTime;

    // Parse response
    if (timedOut) {
      return {
        success: false,
        error: { code: 'TIMEOUT', message: `Bot timed out after ${processConfig.timeoutMs}ms` },
        timedOut: true,
        exitCode,
        stdout,
        stderr,
        durationMs,
      };
    }

    // If process was killed (e.g., due to stdout limit), treat as crash
    if (killed && !timedOut) {
      return {
        success: false,
        error: { code: 'PROCESS_CRASHED', message: 'Bot process was terminated', details: { exitCode } },
        timedOut: false,
        exitCode,
        stdout,
        stderr,
        durationMs,
      };
    }

    if (exitCode !== 0) {
      return {
        success: false,
        error: { code: 'PROCESS_CRASHED', message: `Bot exited with code ${exitCode}`, details: { exitCode } },
        timedOut: false,
        exitCode,
        stdout,
        stderr,
        durationMs,
      };
    }

    // Parse stdout as JSON
    let parsed: unknown;
    try {
      // Only take the first line (in case bot outputs extra lines)
      const firstLine = stdout.trim().split('\n')[0];
      if (!firstLine) {
        return {
          success: false,
          error: { code: 'EMPTY_OUTPUT', message: 'Bot produced no output' },
          timedOut: false,
          exitCode,
          stdout,
          stderr,
          durationMs,
        };
      }
      parsed = JSON.parse(firstLine);
    } catch (e) {
      return {
        success: false,
        error: { code: 'INVALID_JSON', message: 'Bot output is not valid JSON', details: String(e) },
        timedOut: false,
        exitCode,
        stdout,
        stderr,
        durationMs,
      };
    }

    // Validate response structure
    const responseValidation = this.validateBotResponse(parsed);
    if (!responseValidation.valid) {
      return {
        success: false,
        error: responseValidation.error,
        timedOut: false,
        exitCode,
        stdout,
        stderr,
        durationMs,
      };
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

  private validateBotResponse(parsed: unknown): { valid: boolean; response?: BotResponseMessage; error?: BotError } {
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

    if (typeof m.from !== 'string' || m.from.length !== 2) {
      return { valid: false, error: { code: 'INVALID_FROM', message: 'move.from must be valid algebraic notation' } };
    }

    if (typeof m.to !== 'string' || m.to.length !== 2) {
      return { valid: false, error: { code: 'INVALID_TO', message: 'move.to must be valid algebraic notation' } };
    }

    // Basic algebraic validation
    const fromValid = /^[a-i][1-9]$/.test(m.from);
    const toValid = /^[a-i][1-9]$/.test(m.to);
    if (!fromValid || !toValid) {
      return { valid: false, error: { code: 'INVALID_COORDINATES', message: 'Coordinates must be a1-i9' } };
    }

    if (m.from === m.to) {
      return { valid: false, error: { code: 'INVALID_MOVE_SAME_SQUARE', message: 'move.from and move.to must be different' } };
    }

    return { valid: true, response: { move: { piece_id: m.piece_id, from: m.from, to: m.to } } };
  }

  getConfig(): BotRunnerConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<BotRunnerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createBotRunner(config?: Partial<BotRunnerConfig>): BotRunner {
  return new BotRunner(config);
}

export function createBotProcessConfig(
  botId: string,
  command: string,
  args: string[] = [],
  overrides: Partial<Omit<BotProcessConfig, 'botId' | 'command'>> = {}
): BotProcessConfig {
  return {
    botId,
    command: { command, args },
    timeoutMs: overrides.timeoutMs ?? DEFAULT_CONFIG.defaultTimeoutMs,
    maxStdoutBytes: overrides.maxStdoutBytes ?? DEFAULT_CONFIG.defaultMaxStdoutBytes,
    maxStderrBytes: overrides.maxStderrBytes ?? DEFAULT_CONFIG.defaultMaxStderrBytes,
  };
}