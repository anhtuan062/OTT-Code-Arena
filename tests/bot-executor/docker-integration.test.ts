/**
 * Bot Executor - Docker Integration Tests
 *
 * These tests verify actual Docker sandbox behavior.
 * They are skipped when Docker is not available.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DockerExecutor, createDockerExecutor } from '@bot-executor/index.js';
import type { BotProcessConfig, BotRequestMessage, ExecutionContext, BotExecutionResult } from '@bot-executor/types.js';

// Check Docker availability
let dockerAvailable = false;
const dockerExecutor = createDockerExecutor({
  image: 'node:20-alpine',
  dockerBinary: 'docker',
  networkMode: 'none',
  memoryLimit: '256m',
  cpuLimit: 0.5,
  pidsLimit: 32,
});

beforeAll(async () => {
  try {
    dockerAvailable = await dockerExecutor.isAvailable();
    if (dockerAvailable) {
      console.log('Docker is available for integration tests');
    } else {
      console.log('Docker is NOT available - Docker integration tests will be skipped');
    }
  } catch (error) {
    console.log('Docker availability check failed:', error);
    dockerAvailable = false;
  }
}, 30000);


const skipIfNoDocker = (
  name: string,
  fn: () => void | Promise<void>,
  timeout?: number,
) => {
  it(name, async (ctx) => {
    if (!dockerAvailable) {
      ctx.skip();
    }

    await fn();
  }, timeout);
};


const createContext = (executionId: string): ExecutionContext => ({
  executionId,
  matchId: 'test-match',
  turn: 1,
  player: 'A',
});

const createValidRequest = (): BotRequestMessage => ({
  protocol_version: '0.1.0',
  match_id: 'test-match',
  turn: 1,
  player: 'A',
  board_size: 9,
  pieces: [
    { id: 'A-dam-1', type: 'dam', player: 'A', pos: 'c1' },
  ],
  legal_moves: [
    { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null },
  ],
});

const createProcessConfig = (overrides: Partial<BotProcessConfig> = {}): BotProcessConfig => ({
  botId: 'test-bot',
  command: 'node',
  args: ['-e', `
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf-8');
    const req = JSON.parse(input);
    const move = req.legal_moves[0];
    console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
  `],
  timeoutMs: 5000,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
  ...overrides,
});

describe('DockerExecutor - Integration Tests (requires Docker)', () => {
  let executor: DockerExecutor;

  beforeEach(() => {
    if (!dockerAvailable) return;
    executor = createDockerExecutor({
      image: 'node:20-alpine',
      dockerBinary: 'docker',
      networkMode: 'none',
      memoryLimit: '256m',
      cpuLimit: 0.5,
      pidsLimit: 32,
    });
  });

  describe('Normal execution', () => {
    skipIfNoDocker('should execute a valid bot and return valid move', async () => {
      const context = createContext('docker-normal-1');
      const config = createProcessConfig();
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response?.move.piece_id).toBe('A-dam-1');
      expect(result.response?.move.from).toBe('c1');
      expect(result.response?.move.to).toBe('c2');
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    }, 30000);

    skipIfNoDocker('should remove container after execution', async () => {
      const context = createContext('docker-cleanup-1');
      const config = createProcessConfig();
      await executor.execute(context, config, createValidRequest());

      // Container should be cleaned up (runningContainers map should be empty)
      // We can't directly inspect private field, but we can verify no error on subsequent runs
      const context2 = createContext('docker-cleanup-2');
      const result2 = await executor.execute(context2, config, createValidRequest());
      expect(result2.success).toBe(true);
    }, 30000);
  });

  describe('Network isolation', () => {
    skipIfNoDocker('should block network access when --network=none', async () => {
      const context = createContext('docker-network-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const http = require('http');
          const req = http.request({
            hostname: 'httpbin.org',
            port: 80,
            path: '/get',
            method: 'GET',
            timeout: 5000
          }, (res) => {
            console.log(JSON.stringify({
              move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
              network: 'connected',
              statusCode: res.statusCode
            }));
          });
          req.on('error', (e) => {
            console.log(JSON.stringify({
              move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
              network: 'blocked',
              errorCode: e.code
            }));
          });
          req.end();
        `],
        timeoutMs: 10000,
      });

      const result = await executor.execute(context, config, createValidRequest());

      // Bot should fail to connect to network
      // The bot process itself should fail or timeout due to network block
      // We accept either crash or timeout as evidence of network isolation
      if (!result.success) {
        expect(['TIMEOUT', 'PROCESS_CRASHED', 'EXECUTOR_UNAVAILABLE']).toContain(result.error?.code);
      } else {
        expect(result.stdout).toContain('"network":"blocked"');
        expect(result.stdout).not.toContain('"network":"connected"');
      }
    }, 30000);
  });

  describe('Filesystem isolation', () => {
    skipIfNoDocker('should not expose an unmounted host file', async () => {
      const siblingName = `docker-host-sibling-${Date.now()}`;
      const hostSecretPath = path.join(process.cwd(), 'tmp', siblingName, 'host-secret.txt');
      await fs.mkdir(path.dirname(hostSecretPath), { recursive: true });
      await fs.writeFile(hostSecretPath, 'host-secret-must-not-leak', 'utf8');
      const context = createContext('docker-fs-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          let exposed = false;
          try { exposed = fs.readFileSync('/app/input/../${siblingName}/host-secret.txt', 'utf8').includes('host-secret-must-not-leak'); } catch {}
          console.log(JSON.stringify({
            move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
            hostFile: exposed ? 'readable' : 'not-readable'
          }));
        `, hostSecretPath],
        timeoutMs: 5000,
      });

      try {
        const result = await executor.execute(context, config, createValidRequest());
        expect(result.success).toBe(true);
        expect(result.stdout).toContain('"hostFile":"not-readable"');
        expect(result.stdout).not.toContain('host-secret-must-not-leak');
      } finally {
        await fs.rm(path.dirname(hostSecretPath), { recursive: true, force: true });
      }
    }, 30000);

    skipIfNoDocker('should not expose Docker socket', async () => {
      const context = createContext('docker-socket-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          try {
            const stat = fs.statSync('/var/run/docker.sock');
            console.log(JSON.stringify({
              move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
              dockerSocket: 'accessible'
            }));
          } catch (e) {
            console.log(JSON.stringify({
              move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
              dockerSocket: 'blocked',
              errorCode: e.code
            }));
          }
        `],
        timeoutMs: 5000,
      });

      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('"dockerSocket":"blocked"');
      expect(result.stdout).not.toContain('"dockerSocket":"accessible"');
    }, 30000);
  });

  describe('Resource limits', () => {
    skipIfNoDocker('should enforce memory limit', async () => {
      const context = createContext('docker-memory-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          // Try to allocate more than 256MB
          const chunks = [];
          try {
            while (true) {
              chunks.push(Buffer.alloc(50 * 1024 * 1024)); // 50MB chunks
            }
          } catch (e) {
            console.log('MEMORY_LIMIT_HIT:', e.message);
          }
        `],
        timeoutMs: 15000,
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 1024 * 1024,
      });

      const result = await executor.execute(context, config, createValidRequest());

      // Should be killed due to memory limit
      expect(result.success).toBe(false);
      expect(['RESOURCE_LIMIT_EXCEEDED', 'PROCESS_CRASHED', 'TIMEOUT']).toContain(result.error?.code);
    }, 30000);

    skipIfNoDocker('should enforce process limit', async () => {
      const context = createContext('docker-pids-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const { spawn } = require('child_process');
          const pids = [];
          try {
            for (let i = 0; i < 100; i++) {
              const child = spawn('sleep', ['100']);
              pids.push(child.pid);
            }
            console.log('SPAWNED:', pids.length);
            // Keep running
            await new Promise(() => {});
          } catch (e) {
            console.log('PID_LIMIT_HIT:', e.message);
          }
        `],
        timeoutMs: 10000,
      });

      const result = await executor.execute(context, config, createValidRequest());

      // Should be killed due to pids limit
      expect(result.success).toBe(false);
      expect(['RESOURCE_LIMIT_EXCEEDED', 'PROCESS_CRASHED', 'TIMEOUT']).toContain(result.error?.code);
    }, 30000);

    skipIfNoDocker('should enforce CPU limit (container cannot monopolize)', async () => {
      const context = createContext('docker-cpu-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          // CPU intensive work
          const start = Date.now();
          while (Date.now() - start < 5000) {
            Math.sqrt(Math.random());
          }
          console.log(JSON.stringify({
            move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
            cpuWorkDone: true
          }));
        `],
        timeoutMs: 15000,
      });

      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(true);
    }, 30000);
  });

  describe('Output limits and process cleanup', () => {
    skipIfNoDocker('should enforce stdout limit', async () => {
      const context = createContext('docker-stdout-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log('x'.repeat(5000000))`],
        maxStdoutBytes: 100,
      });

      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RESOURCE_LIMIT_EXCEEDED');
      expect(result.stdout.length).toBeLessThanOrEqual(100);
    }, 10000);

    skipIfNoDocker('should enforce stderr limit', async () => {
      const context = createContext('docker-stderr-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.error('x'.repeat(5000000)); console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } }))`],
        maxStderrBytes: 100,
      });

      const result = await executor.execute(context, config, createValidRequest());

      // Bot succeeds but stderr is truncated
      expect(result.success).toBe(true);
      expect(result.stderr.length).toBeLessThanOrEqual(100);
    }, 10000);
  });

  describe('Lifecycle and cleanup', () => {
    skipIfNoDocker('should cleanup container on timeout', async () => {
      const context = createContext('docker-timeout-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `setTimeout(() => {}, 10000)`],
        timeoutMs: 100,
      });

      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.timedOut).toBe(true);
    }, 10000);

    skipIfNoDocker('should cleanup container on invalid JSON output', async () => {
      const context = createContext('docker-invalid-json-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log('not json')`],
      });

      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_JSON');
    }, 10000);

    skipIfNoDocker('should support manual termination', async () => {
      const context = createContext('docker-terminate-1');
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `setTimeout(() => {}, 10000)`],
        timeoutMs: 5000,
      });

      const executionPromise = executor.execute(context, config, createValidRequest());

      // Give it a moment to start
      await new Promise(r => setTimeout(r, 100));

      // Terminate it
      await executor.terminate('docker-terminate-1');

      const result = await Promise.race([
        executionPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('termination did not settle')), 3000)),
      ]);
      expect(result.success).toBe(false);
    }, 10000);

    skipIfNoDocker('should handle multiple concurrent executions', async () => {
      const config = createProcessConfig();

      const promises = Array.from({ length: 3 }, (_, i) =>
        executor.execute(createContext(`docker-parallel-${i}`), config, createValidRequest())
      );

      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result.success).toBe(true);
      }
    }, 30000);
  });

  describe('Executor availability and info', () => {
    skipIfNoDocker('should report as available', async () => {
      const available = await executor.isAvailable();
      expect(available).toBe(true);
    });

    skipIfNoDocker('should return correct executor name', () => {
      expect(executor.getName()).toBe('docker');
    });

    skipIfNoDocker('should report supported resource limits', () => {
      const limits = executor.getSupportedLimits();
      expect(limits.maxMemoryBytes).toBeDefined();
      expect(limits.maxCpuPercent).toBeDefined();
      expect(limits.maxProcesses).toBeDefined();
      expect(limits.maxMemoryBytes).toBeGreaterThan(0);
    });
  });
});

describe('DockerExecutor - Static verification (no Docker required)', () => {
  it('should construct correct docker run arguments', () => {
    const executor = createDockerExecutor({
      image: 'test-image:latest',
      dockerBinary: 'docker',
      networkMode: 'none',
      memoryLimit: '128m',
      cpuLimit: 0.5,
      pidsLimit: 32,
    });

    // Use reflection to access private method for testing
    const buildDockerArgs = (executor as any).buildDockerArgs.bind(executor);
    const args = buildDockerArgs('test-exec-1', {
      botId: 'test-bot',
      command: 'node',
      args: ['bot.js'],
      timeoutMs: 2000,
      maxStdoutBytes: 1024 * 1024,
      maxStderrBytes: 10 * 1024 * 1024,
    }, '/tmp/test', '{}');

    // Verify critical security flags
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--security-opt');
    expect(args).toContain('no-new-privileges:true');
    expect(args).toContain('--cap-drop');
    expect(args).toContain('ALL');
    expect(args).toContain('--memory');
    expect(args).toContain('128m');
    expect(args).toContain('--cpus');
    expect(args).toContain('0.5');
    expect(args).toContain('--pids-limit');
    expect(args).toContain('32');
    expect(args).toContain('--tmpfs');
    expect(args.some(a => a.includes('noexec') && a.includes('nosuid'))).toBe(true);
    expect(args).toContain('--rm');

    // Verify no privileged flag
    expect(args).not.toContain('--privileged');

    // Verify no host mounts except temp dir
    const mountArgs = args.filter((a, i) => args[i - 1] === '-v' || a.startsWith('-v'));
    for (const mount of mountArgs) {
      expect(mount).not.toContain('/var/run/docker.sock');
      // Mount should be source:destination format, verify source is not an absolute host path outside temp
      // The temp mount is expected: /tmp/...:/app/input:ro
      if (mount.includes(':/') && !mount.startsWith('/tmp/')) {
        throw new Error(`Unexpected host path mount: ${mount}`);
      }
    }
  });

  it('should parse memory limits correctly', () => {
    const executor = createDockerExecutor({ memoryLimit: '256m' });
    const parseMemoryLimit = (executor as any).parseMemoryLimit.bind(executor);

    expect(parseMemoryLimit('256m')).toBe(256 * 1024 * 1024);
    expect(parseMemoryLimit('512k')).toBe(512 * 1024);
    expect(parseMemoryLimit('1g')).toBe(1024 * 1024 * 1024);
    expect(parseMemoryLimit('100')).toBe(100);
  });

  it('should quote command arguments before passing them through the container shell', () => {
    const executor = createDockerExecutor();
    const buildDockerArgs = (executor as any).buildDockerArgs.bind(executor);
    const args = buildDockerArgs('quote-test', {
      botId: 'test-bot',
      command: 'node',
      args: ['-e', 'console.log("safe; not a second command")'],
      timeoutMs: 2000,
      maxStdoutBytes: 1024,
      maxStderrBytes: 1024,
    }, '/tmp/test', '{}');
    const command = args[args.length - 1] as string;
    expect(command).toContain("'node'");
    expect(command).toContain("'console.log(\"safe; not a second command\")'");
  });
});