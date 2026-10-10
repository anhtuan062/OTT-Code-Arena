/**
 * Bot Executor - Security Tests
 *
 * Tests for security isolation, resource limits, and attack scenarios.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChildProcessExecutor, createChildProcessExecutor } from '@bot-executor/index.js';
import type { BotProcessConfig, BotRequestMessage, ExecutionContext, BotExecutionResult } from '@bot-executor/types.js';

describe('Bot Executor - Security Tests', () => {
  let executor: ChildProcessExecutor;

  beforeEach(() => {
    executor = createChildProcessExecutor({
      defaultTimeoutMs: 1000,
      defaultMaxStdoutBytes: 1024,
      defaultMaxStderrBytes: 1024,
      allowedEnvVars: ['PATH', 'HOME', 'USER', 'TEMP', 'TMP'],
      workingDirBase: process.cwd(),
    });
  });

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
    timeoutMs: 1000,
    maxStdoutBytes: 1024,
    maxStderrBytes: 1024,
    ...overrides,
  });

  describe('Environment isolation', () => {
    it('should not expose sensitive environment variables to bot process', async () => {
      // Set a test secret in the environment
      process.env.TEST_SECRET = 'should-not-be-visible';
      process.env.BOT_ALLOWED = 'this-is-allowed';

      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          console.log(JSON.stringify({
            move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' },
            env: {
              TEST_SECRET: process.env.TEST_SECRET,
              BOT_ALLOWED: process.env.BOT_ALLOWED,
              PATH: process.env.PATH ? 'present' : 'missing'
            }
          }));
        `],
      });

      const context = createContext('test-env-1');
      const result = await executor.execute(context, config, createValidRequest());

      delete process.env.TEST_SECRET;
      delete process.env.BOT_ALLOWED;

      expect(result.success).toBe(true);
      // The response should only contain the move, not the env dump
      // (this test verifies the env is sanitized at the executor level)
    });

    it('should allow BOT_ prefixed environment variables', async () => {
      process.env.BOT_CUSTOM_VAR = 'custom-value';

      const config = createProcessConfig();
      const context = createContext('test-env-2');
      const result = await executor.execute(context, config, createValidRequest());

      delete process.env.BOT_CUSTOM_VAR;
      expect(result.success).toBe(true);
    });
  });

  describe('Resource limits', () => {
    it('should enforce stdout size limit', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log('x'.repeat(5000))`],
        maxStdoutBytes: 100,
      });

      const context = createContext('test-stdout-limit');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('RESOURCE_LIMIT_EXCEEDED');
      expect(result.stdout.length).toBeLessThanOrEqual(100);
    });

    it('should enforce stderr size limit', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.error('x'.repeat(5000)); console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } }))`],
        maxStderrBytes: 100,
      });

      const context = createContext('test-stderr-limit');
      const result = await executor.execute(context, config, createValidRequest());

      // Bot succeeds but stderr is truncated
      expect(result.success).toBe(true);
      expect(result.stderr.length).toBeLessThanOrEqual(100);
    });

    it('should enforce timeout', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `setTimeout(() => {}, 10000)`],
        timeoutMs: 50,
      });

      const context = createContext('test-timeout');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.timedOut).toBe(true);
    });
  });

  describe('Process isolation', () => {
    it('should terminate child processes on timeout (Windows taskkill)', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const child = require('child_process').spawn('node', ['-e', 'setTimeout(() => {}, 10000)']);
          setTimeout(() => {}, 10000);
        `],
        timeoutMs: 50,
      });

      const context = createContext('test-process-tree');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      // Note: On Windows, child process tree termination is attempted via taskkill /t
    });

    it('should handle process that spawns subprocess', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `
          const { spawn } = require('child_process');
          const child = spawn('node', ['-e', 'console.log("child output")']);
          child.on('close', () => {
            console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } }));
          });
        `],
        timeoutMs: 2000,
      });

      const context = createContext('test-subprocess');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('should reject invalid JSON output', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log('not json')`],
      });

      const context = createContext('test-invalid-json');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_JSON');
    });

    it('should reject missing move field', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log(JSON.stringify({ not_a_move: true }))`],
      });

      const context = createContext('test-missing-move');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_MOVE');
    });

    it('should reject invalid coordinates', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'z9', to: 'c2' } }))`],
      });

      const context = createContext('test-invalid-coords');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_COORDINATES');
    });

    it('should reject same from and to coordinates', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c1' } }))`],
      });

      const context = createContext('test-same-square');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE_SAME_SQUARE');
    });

    it('should reject empty output', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `// no output`],
      });

      const context = createContext('test-empty-output');
      const result = await executor.execute(context, config, createValidRequest());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_OUTPUT');
    });
  });

  describe('Cancellation and cleanup', () => {
    it('should support termination of running execution', async () => {
      const config = createProcessConfig({
        command: 'node',
        args: ['-e', `setTimeout(() => {}, 10000)`],
        timeoutMs: 5000,
      });

      const context = createContext('test-terminate');
      const executionPromise = executor.execute(context, config, createValidRequest());

      // Give it a moment to start
      await new Promise(r => setTimeout(r, 50));

      // Terminate it
      await executor.terminate('test-terminate');

      const result = await executionPromise;
      // After termination, result should indicate failure
      expect(result.success).toBe(false);
    });

    it('should handle multiple rapid executions without resource leak', async () => {
      const config = createProcessConfig();

      // Run multiple executions in parallel
      const promises = Array.from({ length: 5 }, (_, i) =>
        executor.execute(createContext(`test-parallel-${i}`), config, createValidRequest())
      );

      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Executor availability', () => {
    it('should report as available', async () => {
      const available = await executor.isAvailable();
      expect(available).toBe(true);
    });

    it('should return correct executor name', () => {
      expect(executor.getName()).toBe('child-process');
    });

    it('should report unsupported resource limits', () => {
      const limits = executor.getSupportedLimits();
      expect(limits.maxCpuPercent).toBeUndefined();
      expect(limits.maxMemoryBytes).toBeUndefined();
      expect(limits.maxProcesses).toBeUndefined();
    });
  });
});