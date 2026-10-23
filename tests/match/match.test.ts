/**
 * Match Runner - Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from '@engine/index.js';
import { MatchRunner, createMatchRunner, DEFAULT_MATCH_CONFIG } from '@match-runner/index.js';
import type { MatchConfig, BotDefinition, TurnLog, MatchResult } from '@match-runner/types.js';
import type { GameState } from '@engine/types.js';
import type { BotExecutor } from '@bot-executor/types.js';
import type { SourceRevisionExecutor } from '@bot-executor/types.js';
import { ExecutionCancelledError } from '@bot-executor/types.js';

describe('Match Runner', () => {
  const createTestConfig = (overrides: Partial<MatchConfig> = {}): Partial<MatchConfig> => ({
    matchId: 'test-match',
    protocolVersion: '0.1.0',
    maxTurns: 10,
    turnTimeoutMs: 2000,
    maxStdoutBytes: 1024 * 1024,
    maxStderrBytes: 10 * 1024 * 1024,
    failurePolicy: 'forfeit',
    maxRetries: 0,
    logRequests: true,
    logResponses: true,
    logStates: false,
    ...overrides,
  });

  const playerA: BotDefinition = {
    botId: 'bot-a',
    player: 'A',
    command: 'node',
    args: ['-e', `
      const fs = require('fs');
      const input = fs.readFileSync(0, 'utf-8');
      const req = JSON.parse(input);
      const move = req.legal_moves[0];
      console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
    `],
  };

  const playerB: BotDefinition = {
    botId: 'bot-b',
    player: 'B',
    command: 'node',
    args: ['-e', `
      const fs = require('fs');
      const input = fs.readFileSync(0, 'utf-8');
      const req = JSON.parse(input);
      const move = req.legal_moves[0];
      console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
    `],
  };

  describe('createMatchRunner', () => {
    it('should create a match runner with default config', () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      expect(runner).toBeInstanceOf(MatchRunner);
      expect(runner.getConfig().matchId).toBe('test-match');
      expect(runner.getConfig().maxTurns).toBe(10);
    });
  });

  describe('MatchRunner.run', () => {
    it('emits monotonic validated live snapshots without changing the official result', async () => {
      const snapshots: Array<{ sequence: number; status: string; state: GameState; latestMove: unknown }> = [];
      const runner = createMatchRunner(
        createTestConfig({ maxTurns: 1 }),
        playerA,
        playerB,
        { onSnapshot: snapshot => snapshots.push(snapshot) },
      );

      const result = await runner.run();

      expect(result.status).toBe('finished');
      expect(snapshots.length).toBeGreaterThanOrEqual(3);
      expect(snapshots.map(snapshot => snapshot.sequence)).toEqual(
        [...snapshots].sort((a, b) => a.sequence - b.sequence).map(snapshot => snapshot.sequence),
      );
      expect(snapshots[0].status).toBe('in_progress');
      expect(snapshots[0].state.pieces).toHaveLength(18);
      expect(snapshots.some(snapshot => snapshot.latestMove !== null)).toBe(true);
      expect(snapshots.at(-1)?.status).toBe('finished');
    });

    it('routes pinned source revisions only through the dedicated revision executor', async () => {
      const execution = {
        kind: 'source-revision' as const,
        competitorId: 'competitor-a',
        botId: 'bot-a',
        revisionId: 'revision-a',
        runtimeId: 'python3' as const,
        sourceDigest: 'a'.repeat(64),
      };
      const calls: Array<{ revisionId: string; source: Buffer }> = [];
      const releasedScopes: string[] = [];
      const revisionExecutor: SourceRevisionExecutor = {
        async executeRevision(context, revision, request) {
          expect(context.revisionScopeId).toBe('test-match');
          expect(context.resourceLimits).toEqual({ maxMemoryBytes: 128 * 1024 * 1024, maxCpuPercent: 50, maxProcesses: 8 });
          calls.push(revision);
          const move = request.legal_moves[0]!;
          return {
            success: true,
            response: { move: { piece_id: move.piece_id, from: move.from, to: move.to } },
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            durationMs: 1,
          };
        },
        async releaseRevisionScope(scopeId) { releasedScopes.push(scopeId); return true; },
      };
      const legacyExecutor: BotExecutor = {
        async execute() { throw new Error('legacy executor must not receive source revisions'); },
        async terminate() {},
        async isAvailable() { return true; },
        getName() { return 'legacy'; },
        getSupportedLimits() { return {}; },
      };
      const sourceBot: BotDefinition = {
        botId: 'bot-a', player: 'A', command: '', args: [], execution,
      };
      const runner = createMatchRunner(createTestConfig({ maxTurns: 1, resourceLimits: { maxMemoryBytes: 128 * 1024 * 1024, maxCpuPercent: 50, maxProcesses: 8 } }), sourceBot, playerB, {}, legacyExecutor, revisionExecutor, async pinned => {
        expect(pinned).toEqual(execution);
        return Buffer.from('print("ok")');
      });
      const result = await runner.run();
      expect(result.status).toBe('finished');
      expect(calls.length).toBe(1);
      expect(calls[0]!.execution.revisionId).toBe('revision-a');
      expect(releasedScopes).toEqual(['test-match']);
      expect(result.metadata?.sourceRevisions).toEqual([expect.objectContaining({ revisionId: 'revision-a', runtimeId: 'python3' })]);
      expect(result.metadata?.executionDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ player: 'A', runtimeId: 'python3', executionMode: 'raw', engineAcceptedMove: true }),
      ]));
      expect(MatchRunner.createReplay(result).metadata?.sourceRevisions).toEqual(result.metadata?.sourceRevisions);
    });

    it('persists bounded executor timings in match and replay diagnostics', async () => {
      const execution = {
        kind: 'source-revision' as const,
        competitorId: 'competitor-a',
        botId: 'bot-a',
        revisionId: 'revision-a',
        runtimeId: 'cpp' as const,
        sourceDigest: 'a'.repeat(64),
      };
      const sourceBot: BotDefinition = { botId: 'bot-a', player: 'A', command: '', args: [], execution };
      const timings = {
        imageReadinessMs: 11,
        workspacePreparationMs: 12,
        compilationContainerMs: 13,
        artifactValidationMs: 14,
        runtimeContainerMs: 15,
        runtimeStartupMs: null,
        botExecutionMs: null,
        cleanupMs: 16,
        cleanupSucceeded: true,
        totalMs: 17,
        preparationBudgetMs: 10_000,
        compileBudgetMs: 30_000,
        runtimeBudgetMs: 2_000,
        timeoutPhase: null,
      };
      const revisionExecutor: SourceRevisionExecutor = {
        async executeRevision() {
          return {
            success: true,
            response: { move: { piece_id: 'A-dam-1', from: 'a1', to: 'a2' } },
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            durationMs: 17,
            timings,
            provenance: { compilationBackend: 'ephemeral-volume', sourceDigest: 'a'.repeat(64) },
          };
        },
      };
      const runner = createMatchRunner(createTestConfig({ maxTurns: 1 }), sourceBot, playerB, {}, undefined,
        revisionExecutor, async () => Buffer.from('source'));

      const result = await runner.run();
      const expected = {
        imageReadinessMs: 11,
        compilationContainerMs: 13,
        runtimeContainerMs: 15,
        cleanupMs: 16,
        totalMs: 17,
      };
      expect(result.metadata?.executionDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ player: 'A', ...expected }),
      ]));
      expect(MatchRunner.createReplay(result).metadata?.executionDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ player: 'A', ...expected }),
      ]));
    });

    it.each([
      ['COMPILATION_TIMEOUT', 'compilation_timeout'],
      ['RUNTIME_TIMEOUT', 'runtime_timeout'],
    ] as const)('preserves %s diagnostics without applying a move', async (code, stage) => {
      const execution = {
        kind: 'source-revision' as const, competitorId: 'competitor-a', botId: 'bot-a',
        revisionId: 'revision-a', runtimeId: 'cpp' as const, sourceDigest: 'a'.repeat(64),
      };
      const sourceBot: BotDefinition = { botId: 'bot-a', player: 'A', command: '', args: [], execution };
      const revisionExecutor: SourceRevisionExecutor = {
        async executeRevision() {
          return {
            success: false, error: { code, message: 'Compilation or runtime timed out', stage },
            exitCode: null, timedOut: true, stdout: '', stderr: '', durationMs: 30_000,
          };
        },
      };
      const legacyExecutor: BotExecutor = {
        async execute() { throw new Error('legacy executor must not run source revisions'); },
        async terminate() {}, async isAvailable() { return true; },
        getName() { return 'legacy'; }, getSupportedLimits() { return {}; },
      };
      const runner = createMatchRunner(createTestConfig(), sourceBot, playerB, {}, legacyExecutor,
        revisionExecutor, async () => Buffer.from('source'));
      const result = await runner.run();
      expect(result.terminationReason).toBe('bot_timeout');
      expect(result.turnLog[0]?.appliedMove).toBeUndefined();
      expect(result.metadata?.executionDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ errorCode: code, failureStage: stage, engineAcceptedMove: false }),
      ]));
    });

    it('propagates cancellation instead of producing a bot loss', async () => {
      const controller = new AbortController();
      const executor: BotExecutor = {
        async execute(_context, _config, _request) {
          return new Promise((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new ExecutionCancelledError()), { once: true });
          });
        },
        async terminate() {},
        async isAvailable() { return true; },
        getName() { return 'test'; },
        getSupportedLimits() { return {}; },
      };
      const runner = createMatchRunner(createTestConfig(), playerA, playerB, {}, executor);
      const running = runner.run(controller.signal);
      controller.abort();

      await expect(running).rejects.toBeInstanceOf(ExecutionCancelledError);
    });

    it('should execute a complete match between two bots', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      expect(result).toBeDefined();
      expect(result.matchId).toBe('test-match');
      expect(result.protocolVersion).toBe('0.1.0');
      expect(result.status).toBe('finished');
      expect(result.winner).toBeDefined();
      expect(result.terminationReason).toBeDefined();
      expect(result.turnCount).toBeGreaterThan(0);
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.playerA).toEqual(playerA);
      expect(result.playerB).toEqual(playerB);
      expect(result.finalState).toBeDefined();
      expect(result.turnLog).toBeDefined();
      expect(result.turnLog.length).toBe(result.turnCount);
    });

    it('should alternate turns between players', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      for (let i = 0; i < result.turnLog.length; i++) {
        const expectedPlayer = i % 2 === 0 ? 'A' : 'B';
        expect(result.turnLog[i].player).toBe(expectedPlayer);
        expect(result.turnLog[i].turn).toBe(i + 1);
      }
    });

    it('should construct valid requests from engine state', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      for (const log of result.turnLog) {
        if (log.request) {
          expect(log.request.protocol_version).toBe('0.1.0');
          expect(log.request.match_id).toBe('test-match');
          expect(log.request.turn).toBe(log.turn);
          expect(log.request.player).toBe(log.player);
          expect(log.request.board_size).toBe(9);
          expect(Array.isArray(log.request.pieces)).toBe(true);
          expect(Array.isArray(log.request.legal_moves)).toBe(true);
          expect(log.request.legal_moves.length).toBeGreaterThan(0);
        }
      }
    });

    it('should apply legal moves through engine', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      for (const log of result.turnLog) {
        if (log.appliedMove) {
          expect(log.appliedMove.pieceId).toBeDefined();
          expect(log.appliedMove.from).toBeDefined();
          expect(log.appliedMove.to).toBeDefined();
          expect(log.engineResult).toBeDefined();
          expect(log.engineResult?.success).toBe(true);
        }
      }
    });

    it('should detect winner via engine', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      expect(result.winner).toBeDefined();
      expect(['A', 'B', 'draw']).toContain(result.winner);
      expect(result.terminationReason).toBeDefined();
    });

    it('should respect turn limit', async () => {
      const shortConfig = createTestConfig({ maxTurns: 2 });
      const runner = createMatchRunner(shortConfig, playerA, playerB);
      const result = await runner.run();

      expect(result.terminationReason).toBe('turn_limit');
      expect(result.winner).toBe('draw');
      expect(result.turnCount).toBeLessThanOrEqual(2);
    });

    it('should record turn log with all details', async () => {
      const runner = createMatchRunner(createTestConfig({ logStates: true }), playerA, playerB);
      const result = await runner.run();

      expect(result.turnLog.length).toBe(result.turnCount);
      for (const log of result.turnLog) {
        expect(log.turn).toBeDefined();
        expect(log.player).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.request).toBeDefined();
        expect(log.response).toBeDefined();
        expect(log.appliedMove).toBeDefined();
        expect(log.engineResult).toBeDefined();
        expect(log.resultingState).toBeDefined();
      }
    });
  });

  describe('MatchRunner callbacks', () => {
    it('should call onTurnStart and onTurnEnd callbacks', async () => {
      const onTurnStart = vi.fn();
      const onTurnEnd = vi.fn();
      const onMatchEnd = vi.fn();

      const runner = createMatchRunner(createTestConfig(), playerA, playerB, {
        onTurnStart,
        onTurnEnd,
        onMatchEnd,
      });

      const result = await runner.run();

      expect(onTurnStart).toHaveBeenCalledTimes(result.turnCount);
      expect(onTurnEnd).toHaveBeenCalledTimes(result.turnCount);
      expect(onMatchEnd).toHaveBeenCalledTimes(1);
      expect(onMatchEnd).toHaveBeenCalledWith(result);
    });
  });

  describe('MatchReplay', () => {
    it('should create replay from match result', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      const replay = MatchRunner.createReplay(result);

      expect(replay.matchId).toBe(result.matchId);
      expect(replay.protocolVersion).toBe(result.protocolVersion);
      expect(replay.moves).toBeDefined();
      expect(replay.moves.length).toBe(result.turnCount);
      expect(replay.finalState).toEqual(result.finalState);
      expect(replay.winner).toBe(result.winner);
      expect(replay.terminationReason).toBe(result.terminationReason);

      for (let i = 0; i < replay.moves.length; i++) {
        const move = replay.moves[i];
        expect(move.turn).toBe(i + 1);
        expect(move.player).toBe(i % 2 === 0 ? 'A' : 'B');
        expect(move.pieceId).toBeDefined();
        expect(move.from).toBeDefined();
        expect(move.to).toBeDefined();
        expect(move.timestamp).toBeDefined();
      }
    });

    it('should reconstruct complete game state sequence from replay', async () => {
      const runner = createMatchRunner(createTestConfig(), playerA, playerB);
      const result = await runner.run();

      const replay = MatchRunner.createReplay(result);

      // Reconstruct states using the Game Engine
      const engine = new GameEngine();
      // Manually set initial state by creating a fresh engine with the initial state
      // The engine starts at turn 1, player A, which matches replay.initialState
      let currentState = engine.getState();

      // Verify initial state matches
      expect(currentState.turn).toBe(replay.initialState.turn);
      expect(currentState.currentPlayer).toBe(replay.initialState.currentPlayer);
      expect(currentState.pieces.length).toBe(replay.initialState.pieces.length);

      // Apply each move from replay
      for (const move of replay.moves) {
        const applyResult = engine.makeMove(move.pieceId, move.to.row, move.to.col);
        expect(applyResult.success).toBe(true);
        currentState = applyResult.state;
      }

      // Final reconstructed state must match the match's final state
      expect(currentState.turn).toBe(result.finalState.turn);
      expect(currentState.winner).toBe(result.finalState.winner);
      expect(currentState.status).toBe(result.finalState.status);
      expect(currentState.winReason).toBe(result.finalState.winReason);
      expect(replay.finalState).toEqual(result.finalState);
      expect(replay.winner).toBe(result.winner);
      expect(replay.terminationReason).toBe(result.terminationReason);
    });

    it('should represent forfeit correctly without fabricating in-game moves', async () => {
      const badBot: BotDefinition = {
        botId: 'bad-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `console.log('not json');`],
      };

      const runner = createMatchRunner(createTestConfig(), badBot, playerB);
      const result = await runner.run();

      // Bot failure should result in forfeit
      expect(result.winner).toBe('B');
      expect(['bot_timeout', 'bot_invalid_json', 'bot_crash', 'bot_empty_output', 'bot_illegal_move']).toContain(result.terminationReason);

      const replay = MatchRunner.createReplay(result);

      // Replay should have the same termination reason and winner
      expect(replay.terminationReason).toBe(result.terminationReason);
      expect(replay.winner).toBe(result.winner);

      // For forfeit, there should be NO applied moves (turn log has error but no appliedMove)
      // The replay moves array should be empty or only contain the failed turn without a valid appliedMove
      // In our implementation, the failed turn is logged but appliedMove is undefined
      // So replay moves should have empty pieceId for that turn
      if (replay.moves.length > 0) {
        expect(replay.moves[0].pieceId).toBe(''); // No actual move was applied
      }
    });
  });

  describe('Bot failure handling', () => {
    it('should handle bot timeout', async () => {
      const slowBot: BotDefinition = {
        botId: 'slow-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `setTimeout(() => {}, 10000);`],
      };

      const config = createTestConfig({ turnTimeoutMs: 100 });
      const runner = createMatchRunner(config, slowBot, playerB);
      const result = await runner.run();

      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('bot_timeout');
      expect(result.status).toBe('finished');
    });

    it('should handle bot crash', async () => {
      const crashingBot: BotDefinition = {
        botId: 'crashing-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `process.exit(1);`],
      };

      const runner = createMatchRunner(createTestConfig(), crashingBot, playerB);
      const result = await runner.run();

      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('bot_crash');
    });

    it('should handle invalid JSON from bot', async () => {
      const badBot: BotDefinition = {
        botId: 'bad-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `console.log('not json');`],
      };

      const runner = createMatchRunner(createTestConfig(), badBot, playerB);
      const result = await runner.run();

      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('bot_invalid_json');
    });

    it('should handle empty output from bot', async () => {
      const silentBot: BotDefinition = {
        botId: 'silent-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `// nothing`],
      };

      const runner = createMatchRunner(createTestConfig(), silentBot, playerB);
      const result = await runner.run();

      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('bot_empty_output');
    });

    it('should handle illegal move from bot', async () => {
      // Bot that tries to move a piece to an invalid square (not in legal moves)
      // We need a move that passes protocol validation but fails engine validation
      // The first legal move for A-dam-1 is typically to b1, c1, b2, or c2
      // Let's try to move it to d1 (2 squares away - invalid distance)
      const badMoveBot: BotDefinition = {
        botId: 'bad-move-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `
          console.log(JSON.stringify({ move: { piece_id: 'A-dam-1', from: 'c1', to: 'd1' } }));
        `],
      };

      const runner = createMatchRunner(createTestConfig(), badMoveBot, playerB);
      const result = await runner.run();

      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('bot_illegal_move');
    });

    it('should penalize a bot with loss when repeating moves 3 times (d3-d4-d3-d4-d3)', async () => {
      // Oscillating bot that repeats piece A-dam-1 back and forth between c1 and c2
      const oscillatingBot: BotDefinition = {
        botId: 'oscillating-bot',
        player: 'A',
        command: 'node',
        args: ['-e', `
          const fs = require('fs');
          const input = fs.readFileSync(0, 'utf-8');
          const req = JSON.parse(input);
          // Target c2 on turn 1, 5, etc.; c1 on turn 3, 7, etc.
          const targetTo = req.turn % 4 === 1 ? 'c2' : 'c1';
          const move = req.legal_moves.find(m => m.piece_id === 'A-dam-1' && m.to === targetTo)
            || req.legal_moves[0];
          console.log(JSON.stringify({ move: { piece_id: move.piece_id, from: move.from, to: move.to } }));
        `],
      };

      const runner = createMatchRunner(createTestConfig({ maxTurns: 50 }), oscillatingBot, playerB);
      const result = await runner.run();

      // Bot A repeated 3 times (c1-c2-c1-c2-c1), so Bot A loses and Bot B wins by repetition
      expect(result.winner).toBe('B');
      expect(result.terminationReason).toBe('repetition');
      expect(result.turnCount).toBe(7);
    });
  });
});
