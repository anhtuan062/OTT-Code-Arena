/**
 * Tournament Manager - Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  VALID_STATUS_TRANSITIONS,
  MIN_PARTICIPANTS,
  MAX_PARTICIPANTS,
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
} from '@tournament/index.js';
import type {
  Tournament,
  TournamentParticipant,
  TournamentBot,
  TournamentRound,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
  PairingFailureCode,
  TournamentMatchConfig,
  TournamentScoringConfig,
  TerminationReason,
  Player,
} from '@tournament/index.js';

describe('Tournament Types', () => {
  describe('TournamentFormat', () => {
    it('should have single_round_robin format', () => {
      const format: TournamentFormat = 'single_round_robin';
      expect(format).toBe('single_round_robin');
    });
  });

  describe('TournamentStatus', () => {
    it('should support all status values', () => {
      const statuses: TournamentStatus[] = ['draft', 'registration_open', 'registration_closed', 'running', 'completed', 'cancelled'];
      expect(statuses).toHaveLength(6);
    });
  });

  describe('PairingStatus', () => {
    it('should support all pairing status values', () => {
      const statuses: PairingStatus[] = ['scheduled', 'in_progress', 'completed', 'failed', 'cancelled', 'skipped'];
      expect(statuses).toHaveLength(6);
    });
  });

  it('keeps pairing failure diagnostics bounded and non-sensitive', () => {
    const codes: PairingFailureCode[] = ['DOCKER_INFRASTRUCTURE', 'SOURCE_REVISION', 'PERSISTENCE', 'EXECUTION'];
    expect(codes).toHaveLength(4);
    expect(codes).not.toContain(expect.stringContaining('Error'));
  });

  describe('VALID_STATUS_TRANSITIONS', () => {
    it('should allow draft -> registration_open', () => {
      expect(VALID_STATUS_TRANSITIONS.draft).toContain('registration_open');
    });

    it('should allow draft -> cancelled', () => {
      expect(VALID_STATUS_TRANSITIONS.draft).toContain('cancelled');
    });

    it('should allow registration_open -> running', () => {
      expect(VALID_STATUS_TRANSITIONS.registration_open).toContain('running');
    });

    it('should allow registration_open -> cancelled', () => {
      expect(VALID_STATUS_TRANSITIONS.registration_open).toContain('cancelled');
    });

    it('should allow registration_open -> draft', () => {
      expect(VALID_STATUS_TRANSITIONS.registration_open).toContain('draft');
    });

    it('should allow running -> completed', () => {
      expect(VALID_STATUS_TRANSITIONS.running).toContain('completed');
    });

    it('should allow running -> cancelled', () => {
      expect(VALID_STATUS_TRANSITIONS.running).toContain('cancelled');
    });

    it('should not allow completed -> any', () => {
      expect(VALID_STATUS_TRANSITIONS.completed).toHaveLength(0);
    });

    it('should allow cancelled -> draft', () => {
      expect(VALID_STATUS_TRANSITIONS.cancelled).toContain('draft');
    });
  });

  describe('MIN_PARTICIPANTS', () => {
    it('should require at least 2 for single_round_robin', () => {
      expect(MIN_PARTICIPANTS.single_round_robin).toBe(2);
    });
  });

  describe('MAX_PARTICIPANTS', () => {
    it('should be 64', () => {
      expect(MAX_PARTICIPANTS).toBe(64);
    });
  });

  describe('DEFAULT_TOURNAMENT_MATCH_CONFIG', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.protocolVersion).toBe('0.1.0');
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.maxTurns).toBe(200);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.turnTimeoutMs).toBe(2000);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.maxStdoutBytes).toBe(1024 * 1024);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.maxStderrBytes).toBe(10 * 1024 * 1024);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.failurePolicy).toBe('forfeit');
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.maxRetries).toBe(0);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.logRequests).toBe(true);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.logResponses).toBe(true);
      expect(DEFAULT_TOURNAMENT_MATCH_CONFIG.logStates).toBe(false);
    });
  });

  describe('DEFAULT_SCORING_CONFIG', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_SCORING_CONFIG.winPoints).toBe(3);
      expect(DEFAULT_SCORING_CONFIG.drawPoints).toBe(1);
      expect(DEFAULT_SCORING_CONFIG.lossPoints).toBe(0);
      expect(DEFAULT_SCORING_CONFIG.byePoints).toBe(0);
    });
  });
});
