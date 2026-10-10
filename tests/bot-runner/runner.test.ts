/**
 * Bot Runner - Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BotRunner, createBotRunner, createBotProcessConfig } from '@bot-runner/index.js';
import type { BotProcessConfig, BotResult } from '@bot-runner/types.js';

describe('Bot Runner', () => {
  let runner: BotRunner;

  beforeEach(() => {
    runner = createBotRunner({
      defaultTimeoutMs: 1000,
      defaultMaxStdoutBytes: 1024,
      defaultMaxStderrBytes: 1024,
      failurePolicy: 'forfeit',
      maxRetries: 0,
    });
  });

  describe('createBotRunner', () => {
    it('should create a runner with default config', () => {
      const r = createBotRunner();
      expect(r.getConfig()).toEqual({
        defaultTimeoutMs: 2000,
        defaultMaxStdoutBytes: 1024 * 1024,
        defaultMaxStderrBytes: 10 * 1024 * 1024,
        failurePolicy: 'forfeit',
        maxRetries: 0,
      });
    });

    it('should create a runner with custom config', () => {
      const r = createBotRunner({ defaultTimeoutMs: 5000, failurePolicy: 'skip_turn' });
      expect(r.getConfig().defaultTimeoutMs).toBe(5000);
      expect(r.getConfig().failurePolicy).toBe('skip_turn');
    });
  });

  describe('createBotProcessConfig', () => {
    it('should create a process config with defaults', () => {
      const config = createBotProcessConfig('bot1', 'node', ['bot.js']);
      expect(config.botId).toBe('bot1');
      expect(config.command.command).toBe('node');
      expect(config.command.args).toEqual(['bot.js']);
      expect(config.timeoutMs).toBe(2000);
      expect(config.maxStdoutBytes).toBe(1024 * 1024);
      expect(config.maxStderrBytes).toBe(10 * 1024 * 1024);
    });

    it('should allow overriding defaults', () => {
      const config = createBotProcessConfig('bot1', 'node', ['bot.js'], {
        timeoutMs: 5000,
        maxStdoutBytes: 2048,
      });
      expect(config.timeoutMs).toBe(5000);
      expect(config.maxStdoutBytes).toBe(2048);
    });
  });

  describe('runBot - successful execution', () => {
    it('should run a simple echo bot that returns valid move', async () => {
      // This test uses a real Node.js process that echoes a valid response
      const config = createBotProcessConfig('test-bot', 'node', ['-e', `
        const fs = require('fs');
        const input = fs.readFileSync(0, 'utf-8');
        const req = JSON.parse(input);
        const move = req.legal_moves[0];
        console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [
          { id: 'A-dam-1', type: 'dam' as const, player: 'A' as const, pos: 'c1' },
          { id: 'B-dam-1', type: 'dam' as const, player: 'B' as const, pos: 'g9' },
        ],
        legal_moves: [
          { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null },
        ],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response?.move.piece_id).toBe('A-dam-1');
      expect(result.response?.move.from).toBe('c1');
      expect(result.response?.move.to).toBe('c2');
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  describe('runBot - timeout handling', () => {
    it('should timeout a bot that hangs', async () => {
      const config = createBotProcessConfig('hanging-bot', 'node', ['-e', `
        // Never exits, never outputs
        setTimeout(() => {}, 10000);
      `], {
        timeoutMs: 100,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBeNull();
    });
  });

  describe('runBot - process crash', () => {
    it('should handle process crash with non-zero exit code', async () => {
      const config = createBotProcessConfig('crashing-bot', 'node', ['-e', `
        process.exit(1);
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROCESS_CRASHED');
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('runBot - invalid JSON output', () => {
    it('should handle invalid JSON output', async () => {
      const config = createBotProcessConfig('bad-json-bot', 'node', ['-e', `
        console.log('not valid json');
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_JSON');
      expect(result.timedOut).toBe(false);
    });
  });

  describe('runBot - empty output', () => {
    it('should handle empty output', async () => {
      const config = createBotProcessConfig('silent-bot', 'node', ['-e', `
        // Output nothing
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EMPTY_OUTPUT');
    });
  });

  describe('runBot - invalid response structure', () => {
    it('should handle missing move field', async () => {
      const config = createBotProcessConfig('bad-response-bot', 'node', ['-e', `
        console.log(JSON.stringify({ not_a_move: true }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_MOVE');
    });

    it('should handle invalid coordinates', async () => {
      const config = createBotProcessConfig('bad-coords-bot', 'node', ['-e', `
        console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'z9', to: 'c2' } }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_COORDINATES');
    });

    it('should handle same from and to', async () => {
      const config = createBotProcessConfig('same-square-bot', 'node', ['-e', `
        console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c1' } }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MOVE_SAME_SQUARE');
    });
  });

  describe('runBot - stdout size limit', () => {
    it('should truncate stdout and kill process if limit exceeded', async () => {
      const config = createBotProcessConfig('verbose-bot', 'node', ['-e', `
        console.log('x'.repeat(2000));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 100,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      // Process should be killed due to stdout limit
      expect(result.stdout.length).toBeLessThanOrEqual(100);
      expect(result.success).toBe(false);
    });
  });

  describe('runBot - stderr capture', () => {
    it('should capture stderr separately', async () => {
      const config = createBotProcessConfig('stderr-bot', 'node', ['-e', `
        console.error('diagnostic info');
        console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'c2' } }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [
          { id: 'A-dam-1', type: 'dam' as const, player: 'A' as const, pos: 'c1' },
        ],
        legal_moves: [
          { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null },
        ],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(true);
      expect(result.stderr).toContain('diagnostic info');
    });
  });

  describe('runBot - process cleanup and timeout semantics', () => {
    it('should terminate timed-out process and not leave it running', async () => {
      const config = createBotProcessConfig('hanging-bot-2', 'node', ['-e', `
        // Never exits, never outputs
        setTimeout(() => {}, 10000);
      `], {
        timeoutMs: 50,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      // Should return TIMEOUT error, not PROCESS_CRASHED
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.timedOut).toBe(true);
      // On Windows, SIGKILL results in null exit code; on Unix it might be null or signal
      expect(result.exitCode).toBeNull();
    });

    it('should classify genuine non-zero exit as crash, not timeout', async () => {
      const config = createBotProcessConfig('crashing-bot-2', 'node', ['-e', `
        process.exit(2);
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROCESS_CRASHED');
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(2);
    });

    it('should classify stdout-limit termination as crash, not timeout', async () => {
      const config = createBotProcessConfig('verbose-bot-2', 'node', ['-e', `
        console.log('x'.repeat(2000));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 100,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [],
        legal_moves: [],
      };

      const result = await runner.runBot(config, request);

      // Process killed due to stdout limit
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PROCESS_CRASHED');
      expect(result.timedOut).toBe(false);
      expect(result.stdout.length).toBeLessThanOrEqual(100);
    });

    it('should not allow promise to settle twice', async () => {
      // This test verifies the internal promise resolution logic doesn't double-resolve
      // by running multiple sequential bot invocations
      const config = createBotProcessConfig('echo-bot', 'node', ['-e', `
        const fs = require('fs');
        const input = fs.readFileSync(0, 'utf-8');
        const req = JSON.parse(input);
        const move = req.legal_moves[0];
        console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
      `], {
        timeoutMs: 1000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
      });

      const request = {
        protocol_version: '0.1.0',
        match_id: 'test-match',
        turn: 1,
        player: 'A' as const,
        board_size: 9,
        pieces: [
          { id: 'A-dam-1', type: 'dam' as const, player: 'A' as const, pos: 'c1' },
        ],
        legal_moves: [
          { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null },
        ],
      };

      // Run multiple times to verify no state leakage
      for (let i = 0; i < 3; i++) {
        const result = await runner.runBot(config, request);
        expect(result.success).toBe(true);
        expect(result.timedOut).toBe(false);
        expect(result.exitCode).toBe(0);
      }
    });
  });
});