import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import type { SourceRuntimeId } from '@match-runner/types.js';
import type { BotRequestMessage } from '../bot-executor/types.js';
import { strategySdkRoot } from '../bot-executor/strategy-sdk.js';

export interface LocalExecutionResult {
  success: boolean;
  response?: {
    move?: {
      piece_id: string;
      from: string;
      to: string;
    };
  };
  error?: {
    code: string;
    message: string;
    stage: string;
  };
  stderr: string;
  stdout: string;
  exitCode: number | null;
  timings: {
    durationMs: number;
    practiceRequestMs?: number;
  };
  provenance?: undefined;
}

export async function executeStrategyLocally(
  runtimeId: SourceRuntimeId,
  source: Buffer,
  request: BotRequestMessage,
  timeoutMs = 5000
): Promise<LocalExecutionResult> {
  const start = performance.now();
  const sdkDir = strategySdkRoot();
  const baseDir = process.env.BOT_EXECUTION_WORKDIR || os.tmpdir();
  await fs.mkdir(baseDir, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(baseDir, 'ott-practice-local-'));

  try {
    if (runtimeId === 'cpp') {
      const sdkCppDir = path.join(sdkDir, 'cpp');
      const mainCppPath = path.join(tempDir, 'main.cpp');
      const binPath = path.join(tempDir, 'bot');
      const wrapped = `#include "ott_strategy_sdk.hpp"\n${source.toString('utf8')}\nint main() { return ott::run(chooseMove); }\n`;
      await fs.writeFile(mainCppPath, wrapped, 'utf8');

      const compilers = process.env.CXX ? [process.env.CXX] : ['g++', 'clang++'];
      let compileRes: { code: number | null; stderr: string } = { code: 1, stderr: '' };

      for (const compiler of compilers) {
        const res = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
          let stderr = '';
          let proc;
          try {
            proc = spawn(compiler, ['-std=c++17', '-O2', `-I${sdkCppDir}`, mainCppPath, '-o', binPath]);
          } catch (err: any) {
            resolve({ code: 1, stderr: err.message || `Không thể gọi trình biên dịch ${compiler}` });
            return;
          }
          proc.stderr.on('data', (d) => { stderr += d; });
          proc.on('error', (err) => resolve({ code: 1, stderr: err.message }));
          proc.on('close', (code) => resolve({ code, stderr }));
        });
        compileRes = res;
        if (res.code === 0) break;
      }

      if (compileRes.code !== 0) {
        return {
          success: false,
          error: {
            code: 'COMPILER_ERROR',
            message: 'C++ compilation failed',
            stage: 'compilation',
          },
          stderr: compileRes.stderr,
          stdout: '',
          exitCode: compileRes.code,
          timings: { durationMs: Math.round(performance.now() - start) },
        };
      }

      await fs.chmod(binPath, 0o755).catch(() => {});

      const runPromise = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
        let stdout = '';
        let stderr = '';
        const proc = spawn(binPath, []);
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
        }, timeoutMs);

        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        proc.on('error', (err) => {
          clearTimeout(timer);
          resolve({ code: 1, stdout, stderr: err.message });
        });
        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });

        proc.stdin.write(JSON.stringify(request));
        proc.stdin.end();
      });

      const runRes = await runPromise;
      const durationMs = Math.round(performance.now() - start);

      if (runRes.code !== 0) {
        return {
          success: false,
          error: {
            code: 'PROCESS_CRASHED',
            message: `Bot exited with code ${runRes.code}`,
            stage: 'runtime',
          },
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: runRes.code,
          timings: { durationMs },
        };
      }

      try {
        const parsed = JSON.parse(runRes.stdout.trim());
        return {
          success: true,
          response: parsed,
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: 0,
          timings: { durationMs },
        };
      } catch (err: any) {
        return {
          success: false,
          error: {
            code: 'INVALID_OUTPUT',
            message: 'Bot output is not valid JSON',
            stage: 'output_parsing',
          },
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: runRes.code,
          timings: { durationMs },
        };
      }
    } else if (runtimeId === 'python3') {
      const sdkPythonDir = path.join(sdkDir, 'python');
      const mainPyPath = path.join(tempDir, 'main.py');
      await fs.writeFile(mainPyPath, source.toString('utf8'), 'utf8');

      const pythons = process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python'];
      let runRes: { code: number | null; stdout: string; stderr: string } = { code: 1, stdout: '', stderr: '' };

      for (const python of pythons) {
        const res = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
          let stdout = '';
          let stderr = '';
          const runnerScript = path.join(sdkPythonDir, 'runner.py');
          let proc;
          try {
            proc = spawn(python, [runnerScript, mainPyPath], {
              env: { ...process.env, PYTHONPATH: sdkPythonDir },
            });
          } catch (err: any) {
            resolve({ code: 1, stdout: '', stderr: err.message });
            return;
          }
          const timer = setTimeout(() => {
            proc.kill('SIGKILL');
          }, timeoutMs);

          proc.stdout.on('data', (d) => { stdout += d; });
          proc.stderr.on('data', (d) => { stderr += d; });
          proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ code: 1, stdout, stderr: err.message });
          });
          proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
          });

          proc.stdin.write(JSON.stringify(request));
          proc.stdin.end();
        });
        runRes = res;
        if (res.code === 0) break;
      }

      const durationMs = Math.round(performance.now() - start);

      if (runRes.code !== 0) {
        return {
          success: false,
          error: {
            code: 'PROCESS_CRASHED',
            message: `Bot exited with code ${runRes.code}: ${runRes.stderr}`,
            stage: 'runtime',
          },
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: runRes.code,
          timings: { durationMs },
        };
      }

      try {
        const parsed = JSON.parse(runRes.stdout.trim());
        return {
          success: true,
          response: parsed,
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: 0,
          timings: { durationMs },
        };
      } catch (err: any) {
        return {
          success: false,
          error: {
            code: 'INVALID_OUTPUT',
            message: 'Bot output is not valid JSON',
            stage: 'output_parsing',
          },
          stderr: runRes.stderr,
          stdout: runRes.stdout,
          exitCode: runRes.code,
          timings: { durationMs },
        };
      }
    } else {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_RUNTIME',
          message: `Runtime ${runtimeId} is not supported`,
          stage: 'preflight',
        },
        stderr: '',
        stdout: '',
        exitCode: 1,
        timings: { durationMs: 0 },
      };
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
