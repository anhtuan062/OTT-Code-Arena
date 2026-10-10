import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionAuditLogger, createAuditLogger } from '@bot-executor/audit-logger.js';
import type { AuditEvent } from '@bot-executor/audit-logger.js';

describe('ExecutionAuditLogger', () => {
  let logger: ExecutionAuditLogger;

  beforeEach(() => {
    logger = createAuditLogger();
  });

  describe('event logging', () => {
    it('should log execution_requested event', () => {
      logger.executionRequested({
        executionId: 'exec-1',
        matchId: 'match-1',
        tournamentId: 'tourney-1',
        executor: 'child-process',
        player: 'A',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('execution_requested');
      expect(events[0]!.executionId).toBe('exec-1');
      expect(events[0]!.matchId).toBe('match-1');
      expect(events[0]!.tournamentId).toBe('tourney-1');
      expect(events[0]!.timestamp).toBeDefined();
    });

    it('should log execution_started event', () => {
      logger.executionStarted({
        executionId: 'exec-1',
        matchId: 'match-1',
        executor: 'docker',
        player: 'B',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('execution_started');
      expect(events[0]!.player).toBe('B');
    });

    it('should log execution_completed event', () => {
      logger.executionCompleted({
        executionId: 'exec-1',
        matchId: 'match-1',
        durationMs: 150,
        exitCode: 0,
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('execution_completed');
      expect(events[0]!.durationMs).toBe(150);
      expect(events[0]!.exitCode).toBe(0);
    });

    it('should log execution_timed_out event', () => {
      logger.executionTimedOut({
        executionId: 'exec-1',
        matchId: 'match-1',
        durationMs: 2000,
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('execution_timed_out');
    });

    it('should log execution_cancelled event', () => {
      logger.executionCancelled({
        executionId: 'exec-1',
        matchId: 'match-1',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('execution_cancelled');
    });

    it('should log resource_limit_exceeded event', () => {
      logger.resourceLimitExceeded({
        executionId: 'exec-1',
        matchId: 'match-1',
        errorMessage: 'stdout limit exceeded',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('resource_limit_exceeded');
      expect(events[0]!.errorMessage).toBe('stdout limit exceeded');
    });

    it('should log sandbox_startup_failure event', () => {
      logger.sandboxStartupFailure({
        executionId: 'exec-1',
        errorCode: 'EXECUTOR_UNAVAILABLE',
        errorMessage: 'Docker not available',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('sandbox_startup_failure');
    });

    it('should log cleanup_failure event', () => {
      logger.cleanupFailure({
        executionId: 'exec-1',
        errorMessage: 'Failed to remove container',
      });

      const events = logger.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event).toBe('cleanup_failure');
    });
  });

  describe('event querying', () => {
    it('should filter events by type', () => {
      logger.executionRequested({ executionId: 'e1' });
      logger.executionStarted({ executionId: 'e1' });
      logger.executionCompleted({ executionId: 'e1' });
      logger.executionRequested({ executionId: 'e2' });

      expect(logger.getEventsByType('execution_requested')).toHaveLength(2);
      expect(logger.getEventsByType('execution_started')).toHaveLength(1);
      expect(logger.getEventsByType('execution_completed')).toHaveLength(1);
    });

    it('should filter events by execution ID', () => {
      logger.executionRequested({ executionId: 'e1' });
      logger.executionStarted({ executionId: 'e1' });
      logger.executionRequested({ executionId: 'e2' });

      expect(logger.getEventsByExecution('e1')).toHaveLength(2);
      expect(logger.getEventsByExecution('e2')).toHaveLength(1);
    });

    it('should clear events', () => {
      logger.executionRequested({ executionId: 'e1' });
      logger.executionRequested({ executionId: 'e2' });
      logger.clear();
      expect(logger.getEvents()).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should not log when disabled', () => {
      const disabledLogger = createAuditLogger({ enabled: false });
      disabledLogger.executionRequested({ executionId: 'e1' });
      expect(disabledLogger.getEvents()).toHaveLength(0);
    });

    it('bounds retained in-memory events', () => {
      const logger = createAuditLogger({ maxEvents: 2 });
      logger.executionRequested({ executionId: 'one' });
      logger.executionRequested({ executionId: 'two' });
      logger.executionRequested({ executionId: 'three' });
      expect(logger.getEvents()).toHaveLength(2);
      expect(logger.getEvents()[0]?.executionId).toBe('two');
    });

    it('should call custom log function', () => {
      const captured: AuditEvent[] = [];
      const customLogger = createAuditLogger({
        logFunction: (event) => captured.push(event),
      });

      customLogger.executionRequested({ executionId: 'e1' });
      expect(captured).toHaveLength(1);
      expect(captured[0]!.event).toBe('execution_requested');
    });

    it('should not block execution on logging failure by default', () => {
      const failLogger = createAuditLogger({
        logFunction: () => { throw new Error('log failed'); },
        blockExecutionOnFailure: false,
      });

      expect(() => {
        failLogger.executionRequested({ executionId: 'e1' });
      }).not.toThrow();
    });

    it('should block execution on logging failure when configured', () => {
      const failLogger = createAuditLogger({
        logFunction: () => { throw new Error('log failed'); },
        blockExecutionOnFailure: true,
      });

      expect(() => {
        failLogger.executionRequested({ executionId: 'e1' });
      }).toThrow('Audit logging failure blocks execution');
    });
  });

  describe('event immutability', () => {
    it('should return copies of events', () => {
      logger.executionRequested({ executionId: 'e1' });
      const events1 = logger.getEvents();
      const events2 = logger.getEvents();
      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });
  });
});
