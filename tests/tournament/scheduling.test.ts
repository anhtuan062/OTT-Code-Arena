/**
 * Tournament Manager - Scheduling Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateRoundRobinSchedule,
  validateRoundRobinSchedule,
  getNextEligiblePairing,
  getPendingPairings,
  isScheduleComplete,
  findPairing,
  markPairingInProgress,
  markPairingCompleted,
  generatePairingId,
} from '@tournament/scheduling.js';
import type { TournamentParticipant, TournamentRound, TournamentPairing } from '@tournament/types.js';

describe('Tournament Scheduling', () => {
  const createParticipants = (count: number): TournamentParticipant[] => {
    return Array.from({ length: count }, (_, i) => ({
      participantId: `P${i + 1}`,
      name: `Player ${i + 1}`,
      bot: {
        botId: `bot-${i + 1}`,
        player: 'A' as const,
        command: 'node',
        args: ['bot.js'],
      },
      registeredAt: new Date().toISOString(),
    }));
  };

  describe('generateRoundRobinSchedule', () => {
    it('should generate schedule for 2 participants (even)', () => {
      const participants = createParticipants(2);
      const rounds = generateRoundRobinSchedule(participants);

      expect(rounds).toHaveLength(1);
      expect(rounds[0].pairings).toHaveLength(1);
      expect(rounds[0].pairings[0].participantA).toBe('P1');
      expect(rounds[0].pairings[0].participantB).toBe('P2');
    });

    it('should generate schedule for 3 participants (odd)', () => {
      const participants = createParticipants(3);
      const rounds = generateRoundRobinSchedule(participants);

      expect(rounds).toHaveLength(3);
      // Each round has 2 pairings (1 real + 1 bye)
      for (const round of rounds) {
        expect(round.pairings).toHaveLength(2);
        const realPairings = round.pairings.filter(p => p.participantB !== null);
        const byePairings = round.pairings.filter(p => p.participantB === null);
        expect(realPairings).toHaveLength(1);
        expect(byePairings).toHaveLength(1);
      }
    });

    it('should generate schedule for 4 participants (even)', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      expect(rounds).toHaveLength(3);
      for (const round of rounds) {
        expect(round.pairings).toHaveLength(2);
      }
    });

    it('should generate schedule for 5 participants (odd)', () => {
      const participants = createParticipants(5);
      const rounds = generateRoundRobinSchedule(participants);

      expect(rounds).toHaveLength(5);
      for (const round of rounds) {
        expect(round.pairings).toHaveLength(3);
        const realPairings = round.pairings.filter(p => p.participantB !== null);
        const byePairings = round.pairings.filter(p => p.participantB === null);
        expect(realPairings).toHaveLength(2);
        expect(byePairings).toHaveLength(1);
      }
    });

    it('should generate schedule for 6 participants (even)', () => {
      const participants = createParticipants(6);
      const rounds = generateRoundRobinSchedule(participants);

      expect(rounds).toHaveLength(5);
      for (const round of rounds) {
        expect(round.pairings).toHaveLength(3);
      }
    });

    it('should throw for less than 2 participants', () => {
      const participants = createParticipants(1);
      expect(() => generateRoundRobinSchedule(participants)).toThrow('At least 2 participants required');
    });
  });

  describe('validateRoundRobinSchedule', () => {
    it('should validate correct schedule for 4 participants', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const result = validateRoundRobinSchedule(participants, rounds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate correct schedule for 5 participants', () => {
      const participants = createParticipants(5);
      const rounds = generateRoundRobinSchedule(participants);
      const result = validateRoundRobinSchedule(participants, rounds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate pairings', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      // Duplicate a pairing
      rounds[1].pairings[0] = { ...rounds[0].pairings[0] };

      const result = validateRoundRobinSchedule(participants, rounds);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate pairing'))).toBe(true);
    });

    it('should detect self-pairings', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      rounds[0].pairings[0].participantB = rounds[0].pairings[0].participantA;

      const result = validateRoundRobinSchedule(participants, rounds);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('self-pairing'))).toBe(true);
    });

    it('should detect participant appearing twice in same round', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      rounds[0].pairings[1].participantA = rounds[0].pairings[0].participantA;

      const result = validateRoundRobinSchedule(participants, rounds);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('appears') && e.includes('times'))).toBe(true);
    });

    it('should validate bye distribution for odd count', () => {
      const participants = createParticipants(5);
      const rounds = generateRoundRobinSchedule(participants);
      const result = validateRoundRobinSchedule(participants, rounds);

      expect(result.valid).toBe(true);

      // Check each participant has exactly 1 bye
      const byeCounts = new Map<string, number>();
      for (const round of rounds) {
        for (const pairing of round.pairings) {
          if (pairing.participantB === null && pairing.participantA) {
            byeCounts.set(pairing.participantA, (byeCounts.get(pairing.participantA) || 0) + 1);
          }
        }
      }
      for (const p of participants) {
        expect(byeCounts.get(p.participantId)).toBe(1);
      }
    });
  });

  describe('generatePairingId', () => {
    it('should generate deterministic IDs', () => {
      const id1 = generatePairingId('P1', 'P2', 1);
      const id2 = generatePairingId('P1', 'P2', 1);
      expect(id1).toBe(id2);
    });

    it('should include round number', () => {
      const id = generatePairingId('P1', 'P2', 3);
      expect(id).toContain('r3');
    });

    it('should handle bye', () => {
      const id = generatePairingId('P1', null, 1);
      expect(id).toContain('bye');
    });
  });

  describe('findPairing', () => {
    it('should find pairing by ID', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const targetId = rounds[1].pairings[0].pairingId;

      const found = findPairing(rounds, targetId);
      expect(found).toBeDefined();
      expect(found?.pairingId).toBe(targetId);
    });

    it('should return null for non-existent ID', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      const found = findPairing(rounds, 'non-existent');
      expect(found).toBeNull();
    });
  });

  describe('markPairingInProgress', () => {
    it('should mark scheduled pairing as in_progress', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const pairingId = rounds[0].pairings[0].pairingId;

      const result = markPairingInProgress(rounds, pairingId, 'match-123');
      expect(result).toBe(true);

      const pairing = findPairing(rounds, pairingId);
      expect(pairing?.status).toBe('in_progress');
      expect(pairing?.matchId).toBe('match-123');
      expect(pairing?.startedAt).toBeDefined();
    });

    it('should not mark non-scheduled pairing', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const pairingId = rounds[0].pairings[0].pairingId;

      markPairingInProgress(rounds, pairingId, 'match-123');
      const result = markPairingInProgress(rounds, pairingId, 'match-456');
      expect(result).toBe(false);
    });
  });

  describe('markPairingCompleted', () => {
    it('should mark in_progress pairing as completed', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const pairingId = rounds[0].pairings[0].pairingId;

      markPairingInProgress(rounds, pairingId, 'match-123');

      const mockRecord: TournamentPairing['matchResult'] = {
        matchId: 'match-123',
        pairingId,
        participantA: 'P1',
        participantB: 'P2',
        winner: 'A',
        terminationReason: 'goal_reached',
        turnCount: 10,
        durationMs: 1000,
        replayRef: 'match-123',
        completedAt: new Date().toISOString(),
      } as any;

      const result = markPairingCompleted(rounds, pairingId, mockRecord);
      expect(result).toBe(true);

      const pairing = findPairing(rounds, pairingId);
      expect(pairing?.status).toBe('completed');
      expect(pairing?.matchResult).toBeDefined();
      expect(pairing?.completedAt).toBeDefined();
    });

    it('should not mark non-in_progress pairing', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);
      const pairingId = rounds[0].pairings[0].pairingId;

      const mockRecord = {} as any;
      const result = markPairingCompleted(rounds, pairingId, mockRecord);
      expect(result).toBe(false);
    });
  });

  describe('getNextEligiblePairing', () => {
    it('should return first scheduled pairing with opponent', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      const next = getNextEligiblePairing(rounds);
      expect(next).toBeDefined();
      expect(next?.status).toBe('scheduled');
      expect(next?.participantB).not.toBeNull();
    });

    it('should skip bye pairings', () => {
      const participants = createParticipants(3);
      const rounds = generateRoundRobinSchedule(participants);

      // First round has a bye, should skip to next round
      const next = getNextEligiblePairing(rounds);
      expect(next).toBeDefined();
      expect(next?.participantB).not.toBeNull();
    });

    it('should return null when all completed', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      for (const round of rounds) {
        for (const pairing of round.pairings) {
          pairing.status = 'completed';
        }
      }

      const next = getNextEligiblePairing(rounds);
      expect(next).toBeNull();
    });
  });

  describe('isScheduleComplete', () => {
    it('should return true when all pairings completed', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      for (const round of rounds) {
        for (const pairing of round.pairings) {
          pairing.status = 'completed';
        }
      }

      expect(isScheduleComplete(rounds)).toBe(true);
    });

    it('should return false when any pairing pending', () => {
      const participants = createParticipants(4);
      const rounds = generateRoundRobinSchedule(participants);

      expect(isScheduleComplete(rounds)).toBe(false);
    });
  });
});