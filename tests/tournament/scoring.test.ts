/**
 * Tournament Manager - Scoring Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  computeParticipantResults,
  analyzeMatchForParticipant,
  computeHeadToHead,
  sortStandings,
  isForfeitTermination,
  getTournamentStats,
  DEFAULT_SCORING_CONFIG,
} from '@tournament/scoring.js';
import type {
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentScoringConfig,
  TerminationReason,
  Player,
} from '@tournament/types.js';

describe('Tournament Scoring', () => {
  const createParticipants = (ids: string[]): TournamentParticipant[] => {
    return ids.map(id => ({
      participantId: id,
      name: id,
      bot: {
        botId: `bot-${id}`,
        player: 'A' as const,
        command: 'node',
        args: ['bot.js'],
      },
      registeredAt: new Date().toISOString(),
    }));
  };

  const createMatchRecord = (overrides: Partial<TournamentMatchRecord> = {}): TournamentMatchRecord => ({
    matchId: 'match-1',
    pairingId: 'pairing-1',
    participantA: 'P1',
    participantB: 'P2',
    winner: 'A',
    terminationReason: 'goal_reached',
    turnCount: 10,
    durationMs: 1000,
    replayRef: 'match-1',
    completedAt: new Date().toISOString(),
    ...overrides,
  });

  describe('isForfeitTermination', () => {
    it('should identify forfeit termination reasons', () => {
      const forfeitReasons: TerminationReason[] = [
        'bot_timeout',
        'bot_crash',
        'bot_invalid_json',
        'bot_invalid_response',
        'bot_illegal_move',
        'bot_empty_output',
      ];

      for (const reason of forfeitReasons) {
        expect(isForfeitTermination(reason)).toBe(true);
      }
    });

    it('should not identify non-forfeit reasons', () => {
      const nonForfeitReasons: TerminationReason[] = [
        'type_elimination',
        'goal_reached',
        'turn_limit',
        'repetition',
        'insufficient_material',
      ];

      for (const reason of nonForfeitReasons) {
        expect(isForfeitTermination(reason)).toBe(false);
      }
    });

    it('should return false for null', () => {
      expect(isForfeitTermination(null)).toBe(false);
    });
  });

  describe('analyzeMatchForParticipant', () => {
    it('should return win for winner', () => {
      const match = createMatchRecord({ winner: 'A', participantA: 'P1', participantB: 'P2' });
      const result = analyzeMatchForParticipant(match, 'P1');

      expect(result).not.toBeNull();
      expect(result?.result).toBe('win');
      expect(result?.points).toBe(3);
      expect(result?.isForfeit).toBe(false);
    });

    it('should return loss for loser', () => {
      const match = createMatchRecord({ winner: 'A', participantA: 'P1', participantB: 'P2' });
      const result = analyzeMatchForParticipant(match, 'P2');

      expect(result).not.toBeNull();
      expect(result?.result).toBe('loss');
      expect(result?.points).toBe(0);
    });

    it('should return draw for draw', () => {
      const match = createMatchRecord({ winner: 'draw', participantA: 'P1', participantB: 'P2' });
      const result = analyzeMatchForParticipant(match, 'P1');

      expect(result).not.toBeNull();
      expect(result?.result).toBe('draw');
      expect(result?.points).toBe(1);
    });

    it('should return bye for participant with no opponent', () => {
      const match = createMatchRecord({ participantA: 'P1', participantB: null, winner: 'A' });
      const result = analyzeMatchForParticipant(match, 'P1');

      expect(result).not.toBeNull();
      expect(result?.isBye).toBe(true);
      expect(result?.result).toBe('bye');
      expect(result?.points).toBe(3); // byePoints default = winPoints
    });

    it('should return null for participant not in match', () => {
      const match = createMatchRecord({ participantA: 'P1', participantB: 'P2' });
      const result = analyzeMatchForParticipant(match, 'P3');

      expect(result).toBeNull();
    });

    it('should identify forfeit matches', () => {
      const match = createMatchRecord({
        winner: 'A',
        participantA: 'P1',
        participantB: 'P2',
        terminationReason: 'bot_timeout'
      });
      const result = analyzeMatchForParticipant(match, 'P1');

      expect(result?.isForfeit).toBe(true);
    });
  });

  describe('computeParticipantResults', () => {
    it('should compute results from multiple matches', () => {
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'B' }),
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'draw' }),
      ];

      const results = computeParticipantResults('P1', matches);

      expect(results).toHaveLength(2);
      expect(results[0].result).toBe('win');
      expect(results[1].result).toBe('loss');
    });
  });

  describe('computeHeadToHead', () => {
    it('should compute head-to-head points', () => {
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P2', participantB: 'P1', winner: 'A' }), // P2 is A here
      ];

      const h2h = computeHeadToHead('P1', 'P2', matches);

      expect(h2h.matchCount).toBe(2);
      // P1 won first match (3 pts), lost second (0 pts) = 3
      // P2 lost first match (0 pts), won second (3 pts) = 3
      expect(h2h.aPoints).toBe(3);
      expect(h2h.bPoints).toBe(3);
    });

    it('should return 0 for no matches between participants', () => {
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P3' }),
      ];

      const h2h = computeHeadToHead('P1', 'P2', matches);

      expect(h2h.matchCount).toBe(0);
      expect(h2h.aPoints).toBe(0);
      expect(h2h.bPoints).toBe(0);
    });
  });

  describe('computeStandings', () => {
    it('should compute standings for round-robin with clear winner', () => {
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'A' }),
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'A' }),
      ];

      const standings = computeStandings(participants, matches);

      expect(standings).toHaveLength(3);
      // P1: 2 wins = 6 pts
      // P2: 1 win, 1 loss = 3 pts
      // P3: 2 losses = 0 pts
      expect(standings[0].participantId).toBe('P1');
      expect(standings[0].points).toBe(6);
      expect(standings[1].participantId).toBe('P2');
      expect(standings[1].points).toBe(3);
      expect(standings[2].participantId).toBe('P3');
      expect(standings[2].points).toBe(0);
    });

    it('should handle draws correctly', () => {
      const participants = createParticipants(['P1', 'P2']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'draw' }),
      ];

      const standings = computeStandings(participants, matches);

      expect(standings[0].points).toBe(1);
      expect(standings[1].points).toBe(1);
      expect(standings[0].draws).toBe(1);
      expect(standings[1].draws).toBe(1);
    });

    it('should handle forfeits correctly', () => {
      const participants = createParticipants(['P1', 'P2']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({
          matchId: 'm1',
          participantA: 'P1',
          participantB: 'P2',
          winner: 'A',
          terminationReason: 'bot_timeout'
        }),
      ];

      const standings = computeStandings(participants, matches);

      expect(standings[0].participantId).toBe('P1');
      expect(standings[0].wins).toBe(1);
      expect(standings[0].forfeits).toBe(1);
      expect(standings[1].losses).toBe(1);
      expect(standings[1].forfeits).toBe(1); // P2 also has a forfeit (loss by forfeit)
    });

    it('should include head-to-head tiebreak data', () => {
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'A' }),
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'A' }),
      ];

      const standings = computeStandings(participants, matches);

      // P1 should have h2h data against P2 and P3
      expect(standings[0].tiebreakHeadToHead['P2']).toBeDefined();
      expect(standings[0].tiebreakHeadToHead['P3']).toBeDefined();
    });
  });

  describe('sortStandings', () => {
    it('should sort by points descending', () => {
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'A' }),
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'A' }),
      ];

      const standings = computeStandings(participants, matches);
      const sorted = sortStandings(standings, participants, matches);

      expect(sorted[0].participantId).toBe('P1');
      expect(sorted[1].participantId).toBe('P2');
      expect(sorted[2].participantId).toBe('P3');
    });

    it('should use head-to-head for 2-way tie', () => {
      // P1 and P2 both have 3 points, but P1 beat P2 head-to-head
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }), // P1 beats P2
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'B' }), // P3 beats P1
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'B' }), // P3 beats P2
      ];

      // P1: 1W, 1L = 3 pts
      // P2: 1W, 1L = 3 pts
      // P3: 2W = 6 pts

      const standings = computeStandings(participants, matches);
      const sorted = sortStandings(standings, participants, matches);

      // P3 first (6 pts)
      expect(sorted[0].participantId).toBe('P3');
      // P1 and P2 tied at 3 pts - P1 beat P2 head-to-head
      expect(sorted[1].participantId).toBe('P1');
      expect(sorted[2].participantId).toBe('P2');
    });

    it('should use participant ID as stable fallback for 3-way tie', () => {
      // All three have same points and no clear h2h (each 1-1)
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
        createMatchRecord({ matchId: 'm2', participantA: 'P2', participantB: 'P3', winner: 'A' }),
        createMatchRecord({ matchId: 'm3', participantA: 'P3', participantB: 'P1', winner: 'A' }),
      ];

      const standings = computeStandings(participants, matches);
      const sorted = sortStandings(standings, participants, matches);

      // All have 3 points, 1W-1L
      // H2H is circular, so fallback to ID
      expect(sorted[0].participantId).toBe('P1');
      expect(sorted[1].participantId).toBe('P2');
      expect(sorted[2].participantId).toBe('P3');
    });
  });

  describe('getTournamentStats', () => {
    it('should compute tournament statistics', () => {
      const participants = createParticipants(['P1', 'P2', 'P3']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A', terminationReason: 'goal_reached', turnCount: 10 }),
        createMatchRecord({ matchId: 'm2', participantA: 'P1', participantB: 'P3', winner: 'B', terminationReason: 'bot_timeout', turnCount: 5 }),
        createMatchRecord({ matchId: 'm3', participantA: 'P2', participantB: 'P3', winner: 'draw', terminationReason: 'repetition', turnCount: 20 }),
      ];

      const stats = getTournamentStats(participants, matches);

      expect(stats.totalParticipants).toBe(3);
      expect(stats.totalMatches).toBe(3);
      expect(stats.completedMatches).toBe(3);
      expect(stats.forfeitMatches).toBe(1);
      expect(stats.drawMatches).toBe(1);
      expect(stats.averageTurns).toBeCloseTo(11.67, 1);
    });
  });

  describe('Custom scoring config', () => {
    it('should respect custom scoring', () => {
      const customConfig: TournamentScoringConfig = {
        winPoints: 2,
        drawPoints: 1,
        lossPoints: 0,
        byePoints: 2,
      };

      const participants = createParticipants(['P1', 'P2']);
      const matches: TournamentMatchRecord[] = [
        createMatchRecord({ matchId: 'm1', participantA: 'P1', participantB: 'P2', winner: 'A' }),
      ];

      const standings = computeStandings(participants, matches, customConfig);

      expect(standings[0].points).toBe(2);
      expect(standings[1].points).toBe(0);
    });
  });
});