/**
 * Tournament Manager - Executor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockMatchExecutor,
  MatchRunnerExecutor,
} from '@tournament/executor.js';
import type { BotDefinition, MatchConfig, MatchResult, MatchReplay } from '@match-runner/types.js';

describe('Tournament Executor', () => {
  describe('MockMatchExecutor', () => {
    let executor: MockMatchExecutor;

    beforeEach(() => {
      executor = new MockMatchExecutor();
    });

    it('should return configured match result', async () => {
      const mockResult: MatchResult = {
        matchId: 'test-match',
        protocolVersion: '0.1.0',
        status: 'finished',
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
        playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
        finalState: {
          turn: 10,
          currentPlayer: 'A',
          status: 'finished',
          winner: 'A',
          winReason: 'goal_reached',
          pieces: [],
          lastMove: null,
          positionHistory: [],
        },
        turnLog: [],
        initialState: {
          turn: 1,
          currentPlayer: 'A',
          status: 'in_progress',
          winner: null,
          winReason: null,
          pieces: [],
          lastMove: null,
          positionHistory: [],
        },
      };

      const mockReplay: MatchReplay = {
        matchId: 'test-match',
        protocolVersion: '0.1.0',
        initialState: mockResult.initialState,
        moves: [],
        finalState: mockResult.finalState,
        winner: 'A',
        terminationReason: 'goal_reached',
      };

      executor.setMatchResult('test-match', mockResult, mockReplay);

      const result = await executor.executeMatch(
        'test-match',
        { botId: 'bot-a', player: 'A', command: 'node', args: [] },
        { botId: 'bot-b', player: 'B', command: 'node', args: [] },
        {} as MatchConfig
      );

      expect(result).toEqual(mockResult);
    });

    it('should throw for unconfigured match', async () => {
      await expect(executor.executeMatch(
        'unknown-match',
        { botId: 'bot-a', player: 'A', command: 'node', args: [] },
        { botId: 'bot-b', player: 'B', command: 'node', args: [] },
        {} as MatchConfig
      )).rejects.toThrow('No mock result configured');
    });

    it('should record call log', async () => {
      const mockResult: MatchResult = {
        matchId: 'test-match',
        protocolVersion: '0.1.0',
        status: 'finished',
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
        playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
        finalState: {
          turn: 10, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached',
          pieces: [], lastMove: null, positionHistory: [],
        },
        turnLog: [],
        initialState: {
          turn: 1, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null,
          pieces: [], lastMove: null, positionHistory: [],
        },
      };

      executor.setMatchResult('match-1', mockResult, {} as MatchReplay);
      executor.setMatchResult('match-2', mockResult, {} as MatchReplay);

      await executor.executeMatch('match-1', { botId: 'a', player: 'A', command: 'node', args: [] }, { botId: 'b', player: 'B', command: 'node', args: [] }, {} as MatchConfig);
      await executor.executeMatch('match-2', { botId: 'c', player: 'A', command: 'node', args: [] }, { botId: 'd', player: 'B', command: 'node', args: [] }, {} as MatchConfig);

      const log = executor.getCallLog();
      expect(log).toHaveLength(2);
      expect(log[0].matchId).toBe('match-1');
      expect(log[1].matchId).toBe('match-2');
    });

    it('should clear state', () => {
      const mockResult: MatchResult = {
        matchId: 'test-match',
        protocolVersion: '0.1.0',
        status: 'finished',
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
        playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
        finalState: { turn: 10, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
        turnLog: [],
        initialState: { turn: 1, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
      };

      executor.setMatchResult('test-match', mockResult, {} as MatchReplay);
      executor.clear();

      expect(executor.getCallLog()).toHaveLength(0);
    });

    it('should be available', async () => {
      expect(await executor.isAvailable()).toBe(true);
    });
  });

  // Note: MatchRunnerExecutor integration tests require actual bot processes
  // and are tested in the integration test file
});