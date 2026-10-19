/**
 * Tournament Auto-Format Scheduler - Test Suite
 *
 * Verifies Phase 1 Tournament Auto-Format Planning Engine:
 * - 15 target sizes: 8, 16, 24, 32, 64, 100, 125, 128, 160, 200, 201, 256, 512, 1000, 1024 bots.
 * - Group stage rules: 4-8 bots/group, group count G is power of 2, max diff of 1 bot/group.
 * - Knockout bracket: Top 2 advance per group, bracket size = 2 * G (power of 2), matches = 2G - 1.
 * - Preliminary rounds: triggered only when bots > 200, reduces by ~50% each round until <= 200 bots.
 * - Determinism: identical outputs across multiple runs.
 * - Edge cases: N = 2, 3, 4, 7, odd bot counts, and invalid inputs (< 2).
 * - Production safety: verify production limit (64) is preserved.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTournamentFormat,
  validateTournamentPlan,
  getValidGroupCounts,
  selectOptimalGroupCount,
  distributeParticipantsToGroups,
  generatePreliminaryPlan,
  traceChampionPath,
  findMeetingRound,
  isPowerOfTwo,
  MAX_PARTICIPANTS,
} from '@tournament/index.js';

describe('Tournament Auto-Format Scheduler (Phase 1)', () => {
  describe('Power of 2 helper', () => {
    it('should correctly identify powers of 2', () => {
      expect(isPowerOfTwo(1)).toBe(true);
      expect(isPowerOfTwo(2)).toBe(true);
      expect(isPowerOfTwo(4)).toBe(true);
      expect(isPowerOfTwo(8)).toBe(true);
      expect(isPowerOfTwo(16)).toBe(true);
      expect(isPowerOfTwo(32)).toBe(true);
      expect(isPowerOfTwo(64)).toBe(true);

      expect(isPowerOfTwo(0)).toBe(false);
      expect(isPowerOfTwo(-2)).toBe(false);
      expect(isPowerOfTwo(3)).toBe(false);
      expect(isPowerOfTwo(5)).toBe(false);
      expect(isPowerOfTwo(6)).toBe(false);
      expect(isPowerOfTwo(12)).toBe(false);
      expect(isPowerOfTwo(24)).toBe(false);
    });
  });

  describe('Valid group count calculation', () => {
    it('should determine valid power-of-2 group counts with group sizes in [4, 8]', () => {
      // 8 bots: G=1 (1x8) or G=2 (2x4)
      expect(getValidGroupCounts(8)).toEqual([1, 2]);

      // 16 bots: G=2 (2x8) or G=4 (4x4)
      expect(getValidGroupCounts(16)).toEqual([2, 4]);

      // 24 bots: G=4 (4x6)
      expect(getValidGroupCounts(24)).toEqual([4]);

      // 32 bots: G=4 (4x8) or G=8 (8x4)
      expect(getValidGroupCounts(32)).toEqual([4, 8]);

      // 64 bots: G=8 (8x8) or G=16 (16x4)
      expect(getValidGroupCounts(64)).toEqual([8, 16]);

      // 100 bots: G=16 (12x6, 4x7)
      expect(getValidGroupCounts(100)).toEqual([16]);

      // 125 bots: G=16 (3x7, 13x8)
      expect(getValidGroupCounts(125)).toEqual([16]);

      // 128 bots: G=16 (16x8) or G=32 (32x4)
      expect(getValidGroupCounts(128)).toEqual([16, 32]);

      // 160 bots: G=32 (32x5)
      expect(getValidGroupCounts(160)).toEqual([32]);

      // 200 bots: G=32 (24x6, 8x7)
      expect(getValidGroupCounts(200)).toEqual([32]);
    });
  });

  describe('Optimal group count selection (minimizing Docker matches)', () => {
    it('should select G that minimizes total matches', () => {
      // For 8 bots: G=2 gives 15 matches vs G=1 giving 29 matches
      expect(selectOptimalGroupCount(8)).toBe(2);

      // For 16 bots: G=4 gives 31 matches vs G=2 giving 59 matches
      expect(selectOptimalGroupCount(16)).toBe(4);

      // For 32 bots: G=8 gives 63 matches vs G=4 giving 119 matches
      expect(selectOptimalGroupCount(32)).toBe(8);

      // For 64 bots: G=16 gives 127 matches vs G=8 giving 239 matches
      expect(selectOptimalGroupCount(64)).toBe(16);

      // For 128 bots: G=32 gives 255 matches vs G=16 giving 479 matches
      expect(selectOptimalGroupCount(128)).toBe(32);
    });
  });

  describe('Snake draft balanced group distribution', () => {
    it('should distribute bots with at most 1 bot difference across groups', () => {
      const bots100 = Array.from({ length: 100 }, (_, i) => `bot-${i + 1}`);
      const groups = distributeParticipantsToGroups(bots100, 16);

      expect(groups).toHaveLength(16);
      const sizes = groups.map(g => g.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(Math.min(...sizes)).toBe(6);
      expect(Math.max(...sizes)).toBe(7);

      // Total bots distributed must equal 100
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(100);

      // No duplicate bots across groups
      const allBots = groups.flat();
      expect(new Set(allBots).size).toBe(100);
    });
  });

  describe('Preliminary round generation', () => {
    it('should reduce field by ~50% each round until <= 200 bots', () => {
      // 201 bots -> 1 round -> 101 bots
      const p201 = generatePreliminaryPlan(Array.from({ length: 201 }, (_, i) => `b${i + 1}`));
      expect(p201.preliminaryRounds).toHaveLength(1);
      expect(p201.preliminaryRounds[0]?.roundName).toBe('P1');
      expect(p201.preliminaryRounds[0]?.incomingBotCount).toBe(201);
      expect(p201.preliminaryRounds[0]?.matchCount).toBe(100);
      expect(p201.preliminaryRounds[0]?.byeCount).toBe(1);
      expect(p201.preliminaryRounds[0]?.outgoingBotCount).toBe(101);
      expect(p201.remainingParticipants).toHaveLength(101);

      // 1024 bots -> 3 rounds (1024 -> 512 -> 256 -> 128)
      const p1024 = generatePreliminaryPlan(Array.from({ length: 1024 }, (_, i) => `b${i + 1}`));
      expect(p1024.preliminaryRounds).toHaveLength(3);
      expect(p1024.preliminaryRounds.map(r => r.roundName)).toEqual(['P1', 'P2', 'P3']);
      expect(p1024.preliminaryRounds[0]?.incomingBotCount).toBe(1024);
      expect(p1024.preliminaryRounds[0]?.outgoingBotCount).toBe(512);
      expect(p1024.preliminaryRounds[1]?.incomingBotCount).toBe(512);
      expect(p1024.preliminaryRounds[1]?.outgoingBotCount).toBe(256);
      expect(p1024.preliminaryRounds[2]?.incomingBotCount).toBe(256);
      expect(p1024.preliminaryRounds[2]?.outgoingBotCount).toBe(128);
      expect(p1024.remainingParticipants).toHaveLength(128);
    });
  });

  describe('The 15 target participant sizes verification', () => {
    // Target 1: 8 bots
    it('should correctly schedule N = 8 bots', () => {
      const plan = calculateTournamentFormat(8);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.preliminaryRounds).toHaveLength(0);
      expect(plan.botsEnteringGroupStage).toBe(8);
      expect(plan.groupStage?.groupCount).toBe(2);
      expect(plan.groupStage?.groups.map(g => g.botCount)).toEqual([4, 4]);
      expect(plan.groupStage?.totalMatches).toBe(12);
      expect(plan.groupStage?.advancingCount).toBe(4);
      expect(plan.knockoutBracket.bracketSize).toBe(4);
      expect(plan.knockoutBracket.totalMatches).toBe(3);
      expect(plan.totalDockerMatches).toBe(15);
    });

    // Target 2: 16 bots
    it('should correctly schedule N = 16 bots', () => {
      const plan = calculateTournamentFormat(16);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(16);
      expect(plan.groupStage?.groupCount).toBe(4);
      expect(plan.groupStage?.groups.every(g => g.botCount === 4)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(24);
      expect(plan.knockoutBracket.bracketSize).toBe(8);
      expect(plan.knockoutBracket.totalMatches).toBe(7);
      expect(plan.totalDockerMatches).toBe(31);
    });

    // Target 3: 24 bots
    it('should correctly schedule N = 24 bots', () => {
      const plan = calculateTournamentFormat(24);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(24);
      expect(plan.groupStage?.groupCount).toBe(4);
      expect(plan.groupStage?.groups.every(g => g.botCount === 6)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(60); // 4 * 15
      expect(plan.knockoutBracket.bracketSize).toBe(8);
      expect(plan.knockoutBracket.totalMatches).toBe(7);
      expect(plan.totalDockerMatches).toBe(67);
    });

    // Target 4: 32 bots
    it('should correctly schedule N = 32 bots', () => {
      const plan = calculateTournamentFormat(32);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(32);
      expect(plan.groupStage?.groupCount).toBe(8);
      expect(plan.groupStage?.groups.every(g => g.botCount === 4)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(48); // 8 * 6
      expect(plan.knockoutBracket.bracketSize).toBe(16);
      expect(plan.knockoutBracket.totalMatches).toBe(15);
      expect(plan.totalDockerMatches).toBe(63);
    });

    // Target 5: 64 bots
    it('should correctly schedule N = 64 bots', () => {
      const plan = calculateTournamentFormat(64);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(64);
      expect(plan.groupStage?.groupCount).toBe(16);
      expect(plan.groupStage?.groups.every(g => g.botCount === 4)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(96); // 16 * 6
      expect(plan.knockoutBracket.bracketSize).toBe(32);
      expect(plan.knockoutBracket.totalMatches).toBe(31);
      expect(plan.totalDockerMatches).toBe(127);
    });

    // Target 6: 100 bots
    it('should correctly schedule N = 100 bots', () => {
      const plan = calculateTournamentFormat(100);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(100);
      expect(plan.groupStage?.groupCount).toBe(16);
      expect(plan.groupStage?.minGroupSize).toBe(6);
      expect(plan.groupStage?.maxGroupSize).toBe(7);
      // 12 groups of 6 (15 matches), 4 groups of 7 (21 matches): 12*15 + 4*21 = 180 + 84 = 264
      expect(plan.groupStage?.totalMatches).toBe(264);
      expect(plan.knockoutBracket.bracketSize).toBe(32);
      expect(plan.knockoutBracket.totalMatches).toBe(31);
      expect(plan.totalDockerMatches).toBe(295);
    });

    // Target 7: 125 bots
    it('should correctly schedule N = 125 bots', () => {
      const plan = calculateTournamentFormat(125);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(125);
      expect(plan.groupStage?.groupCount).toBe(16);
      expect(plan.groupStage?.minGroupSize).toBe(7);
      expect(plan.groupStage?.maxGroupSize).toBe(8);
      // 3 groups of 7 (21 matches), 13 groups of 8 (28 matches): 3*21 + 13*28 = 63 + 364 = 427
      expect(plan.groupStage?.totalMatches).toBe(427);
      expect(plan.knockoutBracket.bracketSize).toBe(32);
      expect(plan.knockoutBracket.totalMatches).toBe(31);
      expect(plan.totalDockerMatches).toBe(458);
    });

    // Target 8: 128 bots
    it('should correctly schedule N = 128 bots', () => {
      const plan = calculateTournamentFormat(128);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.groups.every(g => g.botCount === 4)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(192); // 32 * 6
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      expect(plan.totalDockerMatches).toBe(255);
    });

    // Target 9: 160 bots
    it('should correctly schedule N = 160 bots', () => {
      const plan = calculateTournamentFormat(160);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(160);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.groups.every(g => g.botCount === 5)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(320); // 32 * 10
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      expect(plan.totalDockerMatches).toBe(383);
    });

    // Target 10: 200 bots
    it('should correctly schedule N = 200 bots', () => {
      const plan = calculateTournamentFormat(200);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(false);
      expect(plan.botsEnteringGroupStage).toBe(200);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.minGroupSize).toBe(6);
      expect(plan.groupStage?.maxGroupSize).toBe(7);
      // 24 groups of 6 (15 matches), 8 groups of 7 (21 matches): 24*15 + 8*21 = 360 + 168 = 528
      expect(plan.groupStage?.totalMatches).toBe(528);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      expect(plan.totalDockerMatches).toBe(591);
    });

    // Target 11: 201 bots (Regional Qualifiers triggered)
    it('should correctly schedule N = 201 bots', () => {
      const plan = calculateTournamentFormat(201);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.map(r => r.incomingBotCount)).toEqual([51, 50, 50, 50]);
      expect(plan.regionalPlan?.regions.map(r => r.matchCount)).toEqual([25, 25, 25, 25]);
      expect(plan.regionalPlan?.totalMatches).toBe(100);
      expect(plan.regionalPlan?.totalQualifiers).toBe(101);

      expect(plan.botsEnteringGroupStage).toBe(101);
      expect(plan.groupStage?.groupCount).toBe(16);
      expect(plan.groupStage?.groups.every(g => g.botCount >= 4 && g.botCount <= 8)).toBe(true);
      expect(plan.groupStage?.totalMatches).toBe(270);
      expect(plan.knockoutBracket.bracketSize).toBe(32);
      expect(plan.knockoutBracket.totalMatches).toBe(31);
      // 100 regional + 270 group + 31 knockout = 401
      expect(plan.totalDockerMatches).toBe(401);
    });

    it('should carry only actual regional survivors for N = 202 bots', () => {
      const plan = calculateTournamentFormat(202);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.regionalPlan?.regions.map(r => r.incomingBotCount)).toEqual([51, 51, 50, 50]);
      expect(plan.regionalPlan?.regions.map(r => r.qualifierCount)).toEqual([26, 26, 25, 25]);
      expect(plan.regionalPlan?.regions.map(r => r.matchCount)).toEqual([25, 25, 25, 25]);
      expect(plan.regionalPlan?.totalQualifiers).toBe(102);
      expect(plan.botsEnteringGroupStage).toBe(102);
    });

    // Target 12: 256 bots (Regional Qualifiers)
    it('should correctly schedule N = 256 bots', () => {
      const plan = calculateTournamentFormat(256);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 64)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 32)).toBe(true);
      expect(plan.regionalPlan?.totalMatches).toBe(128);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192); // 32 * 6
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 128 regional + 192 group + 63 knockout = 383
      expect(plan.totalDockerMatches).toBe(383);
    });

    // Target 13: 512 bots (Regional Qualifiers)
    it('should correctly schedule N = 512 bots', () => {
      const plan = calculateTournamentFormat(512);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 128)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 96)).toBe(true);
      expect(plan.regionalPlan?.totalMatches).toBe(384);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 384 regional + 192 group + 63 knockout = 639
      expect(plan.totalDockerMatches).toBe(639);
    });

    // Target 14: 1000 bots (Regional Qualifiers)
    it('should correctly schedule N = 1000 bots', () => {
      const plan = calculateTournamentFormat(1000);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 250)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 218)).toBe(true);
      expect(plan.regionalPlan?.totalMatches).toBe(872);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 872 regional + 192 group + 63 knockout = 1127
      expect(plan.totalDockerMatches).toBe(1127);
    });

    // Target 15: 1024 bots (Regional Qualifiers)
    it('should correctly schedule N = 1024 bots', () => {
      const plan = calculateTournamentFormat(1024);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 256)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 224)).toBe(true);
      expect(plan.regionalPlan?.totalMatches).toBe(896);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 896 regional + 192 group + 63 knockout = 1151
      expect(plan.totalDockerMatches).toBe(1151);
    });

    // Target 16: 2048 bots (Regional Qualifiers)
    it('should correctly schedule N = 2048 bots', () => {
      const plan = calculateTournamentFormat(2048);
      const validation = validateTournamentPlan(plan);
      expect(validation.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan).toBeDefined();
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 512)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 480)).toBe(true);
      expect(plan.regionalPlan?.totalMatches).toBe(1920);
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 1920 regional + 192 group + 63 knockout = 2175
      expect(plan.totalDockerMatches).toBe(2175);
    });
  });

  describe('Comprehensive Invariants for all test counts', () => {
    const testCases = [8, 16, 24, 32, 64, 100, 125, 128, 160, 200, 201, 256, 512, 1000, 1024];

    testCases.forEach(n => {
      it(`preserves all tournament invariants for N = ${n}`, () => {
        const plan = calculateTournamentFormat(n);
        const val = validateTournamentPlan(plan);
        expect(val.valid, `Validation failed for N=${n}: ${val.errors.join(', ')}`).toBe(true);

        // Group stage invariants
        const gs = plan.groupStage!;
        expect(isPowerOfTwo(gs.groupCount)).toBe(true);
        expect(gs.minGroupSize).toBeGreaterThanOrEqual(4);
        expect(gs.maxGroupSize).toBeLessThanOrEqual(8);
        expect(gs.maxGroupSize - gs.minGroupSize).toBeLessThanOrEqual(1);

        // Knockout invariants
        expect(gs.advancingCount).toBe(gs.groupCount * 2);
        expect(plan.knockoutBracket.bracketSize).toBe(gs.advancingCount);
        expect(isPowerOfTwo(plan.knockoutBracket.bracketSize)).toBe(true);
        expect(plan.knockoutBracket.totalMatches).toBe(plan.knockoutBracket.bracketSize - 1);

        // Match sum invariant
        const prelimM = plan.preliminaryRounds.reduce((acc, r) => acc + r.matchCount, 0);
        expect(plan.totalDockerMatches).toBe(prelimM + gs.totalMatches + plan.knockoutBracket.totalMatches);
      });
    });
  });

  describe('Determinism', () => {
    it('produces byte-for-byte identical plans for identical inputs across multiple runs', () => {
      const run1 = calculateTournamentFormat(201);
      const run2 = calculateTournamentFormat(201);
      const run3 = calculateTournamentFormat(201);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
      expect(JSON.stringify(run2)).toBe(JSON.stringify(run3));
    });

    it('allocates byes deterministically to top seed', () => {
      const bots = ['bot-alpha', 'bot-beta', 'bot-gamma', 'bot-delta', 'bot-epsilon'];
      const prelim = generatePreliminaryPlan(bots, 3);
      expect(prelim.preliminaryRounds[0]?.pairings[0]?.isBye).toBe(true);
      expect(prelim.preliminaryRounds[0]?.pairings[0]?.participantA).toBe('bot-alpha');
      expect(prelim.preliminaryRounds[0]?.pairings[0]?.participantB).toBeNull();
    });
  });

  describe('Edge cases and small participant counts', () => {
    it('handles N = 2 bots (direct Final)', () => {
      const plan = calculateTournamentFormat(2);
      expect(plan.hasPreliminary).toBe(false);
      expect(plan.groupStage).toBeNull();
      expect(plan.knockoutBracket.bracketSize).toBe(2);
      expect(plan.knockoutBracket.totalMatches).toBe(1);
      expect(plan.totalDockerMatches).toBe(1);
      expect(validateTournamentPlan(plan).valid).toBe(true);
    });

    it('handles N = 3 bots (direct Semifinal + Final with bye)', () => {
      const plan = calculateTournamentFormat(3);
      expect(plan.hasPreliminary).toBe(false);
      expect(plan.groupStage).toBeNull();
      expect(plan.knockoutBracket.bracketSize).toBe(3);
      expect(plan.knockoutBracket.totalMatches).toBe(2);
      expect(plan.totalDockerMatches).toBe(2);
      expect(validateTournamentPlan(plan).valid).toBe(true);
    });

    it('handles N = 4 bots (1 group of 4, Top 2 to Final)', () => {
      const plan = calculateTournamentFormat(4);
      expect(plan.hasPreliminary).toBe(false);
      expect(plan.groupStage?.groupCount).toBe(1);
      expect(plan.groupStage?.groups[0]?.botCount).toBe(4);
      expect(plan.groupStage?.totalMatches).toBe(6);
      expect(plan.knockoutBracket.bracketSize).toBe(2);
      expect(plan.knockoutBracket.totalMatches).toBe(1);
      expect(plan.totalDockerMatches).toBe(7);
      expect(validateTournamentPlan(plan).valid).toBe(true);
    });

    it('handles N = 7 bots (1 group of 7, Top 2 to Final)', () => {
      const plan = calculateTournamentFormat(7);
      expect(plan.hasPreliminary).toBe(false);
      expect(plan.groupStage?.groupCount).toBe(1);
      expect(plan.groupStage?.groups[0]?.botCount).toBe(7);
      expect(plan.groupStage?.totalMatches).toBe(21);
      expect(plan.knockoutBracket.bracketSize).toBe(2);
      expect(plan.knockoutBracket.totalMatches).toBe(1);
      expect(plan.totalDockerMatches).toBe(22);
      expect(validateTournamentPlan(plan).valid).toBe(true);
    });

    it('handles odd bot counts in group stage (e.g. N = 17, 33, 65)', () => {
      [17, 33, 65, 101, 199].forEach(oddCount => {
        const plan = calculateTournamentFormat(oddCount);
        expect(validateTournamentPlan(plan).valid).toBe(true);
        expect(plan.groupStage!.maxGroupSize - plan.groupStage!.minGroupSize).toBeLessThanOrEqual(1);
      });
    });

    it('throws when participant count is less than 2', () => {
      expect(() => calculateTournamentFormat(1)).toThrow('at least 2 participants');
      expect(() => calculateTournamentFormat(0)).toThrow('at least 2 participants');
      expect(() => calculateTournamentFormat(-5)).toThrow('at least 2 participants');
      expect(() => calculateTournamentFormat([])).toThrow('at least 2 participants');
    });
  });

  describe('Exhaustive Invariant Verification (ALL N from 2 to 2048)', () => {
    it('verifies all invariants hold for every integer N from 2 to 2048 without failure', () => {
      for (let n = 2; n <= 2048; n++) {
        const plan = calculateTournamentFormat(n);
        const val = validateTournamentPlan(plan);
        if (!val.valid) {
          throw new Error(`Invariant violation at N=${n}: ${val.errors.join('; ')}`);
        }
        expect(val.valid).toBe(true);

        if (n <= 200 && n >= 4) {
          expect(plan.hasPreliminary).toBe(false);
          expect(plan.botsEnteringGroupStage).toBe(n);
          expect(isPowerOfTwo(plan.groupStage!.groupCount)).toBe(true);
          expect(plan.groupStage!.maxGroupSize - plan.groupStage!.minGroupSize).toBeLessThanOrEqual(1);
          expect(plan.groupStage!.minGroupSize).toBeGreaterThanOrEqual(4);
          expect(plan.groupStage!.maxGroupSize).toBeLessThanOrEqual(8);
        } else if (n > 200) {
          expect(plan.hasPreliminary).toBe(true);
          expect(plan.botsEnteringGroupStage).toBeLessThanOrEqual(128);
          expect(plan.botsEnteringGroupStage).toBeGreaterThanOrEqual(4);
          expect(plan.regionalPlan).toBeDefined();
        }
      }
    });
  });

  describe('Regional Qualifiers: Non-presumption of match winners', () => {
    it('does not pre-assign the identity of either participant as match winner in preliminary rounds', () => {
      const plan = calculateTournamentFormat(256);
      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan?.regions).toHaveLength(4);

      for (const region of plan.regionalPlan!.regions) {
        for (const round of region.rounds) {
          for (const pairing of round.pairings) {
            if (!pairing.isBye) {
              expect(pairing.participantA).toMatch(/^bot-/);
              expect(pairing.participantB).toMatch(/^bot-/);
            }
          }
        }
      }

      // Group stage participants are abstract region qualifiers (Region-X-QY)
      const groupBots = plan.groupStage!.groups.flatMap(g => g.participants);
      for (const slot of groupBots) {
        expect(slot).toMatch(/^Region-\d+-Q\d+$/);
        expect(slot.startsWith('bot-')).toBe(false);
      }
    });

    it('preserves real bot IDs for byes while leaving match winners unresolved', () => {
      const plan = calculateTournamentFormat(201); // 201 bots -> Region 1 has 51 bots: 1 bye
      expect(plan.regionalPlan?.regions).toHaveLength(4);
      const reg1 = plan.regionalPlan!.regions[0]!;
      expect(reg1.incomingBotCount).toBe(51);
      const r1 = reg1.rounds[0]!;
      expect(r1.byeCount).toBe(1);

      const byes = r1.pairings.filter(p => p.isBye);
      expect(byes).toHaveLength(1);
      for (const bye of byes) {
        expect(bye.participantA).toMatch(/^bot-/);
        expect(bye.participantB).toBeNull();
      }

      // Match pairings have unresolved winner slots
      const matches = r1.pairings.filter(p => !p.isBye);
      expect(matches).toHaveLength(25);
      for (const m of matches) {
        expect(m.participantA).toMatch(/^bot-/);
        expect(m.participantB).toMatch(/^bot-/);
      }
    });

    it('keeps all dynamically-sized regional qualifiers represented in the group stage', () => {
      const scales = [201, 256, 512, 1000, 1024, 2048, 4096];
      for (const n of scales) {
        const plan = calculateTournamentFormat(n);
        expect(plan.groupStage?.groupCount).toBeGreaterThan(0);

        for (const group of plan.groupStage!.groups) {
          expect(group.botCount).toBeGreaterThanOrEqual(4);
          const regionOrigins = group.participants.map(p => {
            const m = p.match(/^Region-(\d+)-Q\d+$/);
            expect(m).not.toBeNull();
            return m![1];
          });
          expect(new Set(regionOrigins).size).toBeGreaterThan(0);
        }
      }
    });

    it('should correctly schedule N = 4096 bots with 4 regions', () => {
      const plan = calculateTournamentFormat(4096);
      const val = validateTournamentPlan(plan);
      expect(val.valid).toBe(true);

      expect(plan.hasPreliminary).toBe(true);
      expect(plan.regionalPlan?.regionCount).toBe(4);
      expect(plan.regionalPlan?.regions.every(r => r.incomingBotCount === 1024)).toBe(true);
      expect(plan.regionalPlan?.regions.every(r => r.matchCount === 992)).toBe(true); // 1024 - 32 = 992
      expect(plan.regionalPlan?.totalMatches).toBe(3968); // 4 * 992 = 3968
      expect(plan.regionalPlan?.totalQualifiers).toBe(128);

      expect(plan.botsEnteringGroupStage).toBe(128);
      expect(plan.groupStage?.groupCount).toBe(32);
      expect(plan.groupStage?.totalMatches).toBe(192);
      expect(plan.knockoutBracket.bracketSize).toBe(64);
      expect(plan.knockoutBracket.totalMatches).toBe(63);
      // 3968 regional + 192 group + 63 knockout = 4223
      expect(plan.totalDockerMatches).toBe(4223);
    });
  });

  describe('Knockout Bracket: Mathematical Anti-Rematch Invariant', () => {
    it('proves that Top 2 from the same group can NEVER meet before the Final across all group counts', () => {
      const groupCounts = [1, 2, 4, 8, 16, 32];

      for (const G of groupCounts) {
        const dummyBots = Array.from({ length: G * 4 }, (_, i) => `bot-${i + 1}`);
        const plan = calculateTournamentFormat(dummyBots);
        const bracket = plan.knockoutBracket;
        const totalRounds = bracket.rounds.length;
        const r1Pairings = bracket.rounds[0]!.pairings;

        if (G === 1) {
          // 1 group -> bracket size 2 -> Round 1 is the Final
          expect(totalRounds).toBe(1);
          const finalMatch = r1Pairings[0]!;
          expect(finalMatch.participantA).toBe('1st-Group-A');
          expect(finalMatch.participantB).toBe('2nd-Group-A');
          continue;
        }

        // For G >= 2: verify every group's 1st and 2nd meeting round
        for (const group of plan.groupStage!.groups) {
          const winnerTag = `1st-${group.groupId}`;
          const runnerUpTag = `2nd-${group.groupId}`;

          const match1 = r1Pairings.find(p => p.participantA === winnerTag || p.participantB === winnerTag)!;
          const match2 = r1Pairings.find(p => p.participantA === runnerUpTag || p.participantB === runnerUpTag)!;

          expect(match1).toBeDefined();
          expect(match2).toBeDefined();

          // 1. In Round 1, they never play against each other
          expect(match1.matchIndex).not.toBe(match2.matchIndex);

          // 2. One is in Top Half (<= G/2), the other is in Bottom Half (> G/2)
          const half = G / 2;
          const match1InTopHalf = match1.matchIndex <= half;
          const match2InTopHalf = match2.matchIndex <= half;
          expect(match1InTopHalf).not.toBe(match2InTopHalf);

          // 3. Lowest Common Ancestor (meeting round) is strictly the Final
          const meetingRound = findMeetingRound(match1.matchIndex, match2.matchIndex);
          expect(meetingRound).toBe(totalRounds);

          // 4. Trace theoretical champion paths and verify disjointness before Final
          const path1 = traceChampionPath(match1.matchIndex, bracket);
          const path2 = traceChampionPath(match2.matchIndex, bracket);
          expect(path1).toHaveLength(totalRounds);
          expect(path2).toHaveLength(totalRounds);

          for (let r = 0; r < totalRounds - 1; r++) {
            // In every round before the Final, their matches must be distinct
            expect(path1[r]!.matchIndex).not.toBe(path2[r]!.matchIndex);
          }
          // In the Final, both champion paths converge at Match 1
          expect(path1[totalRounds - 1]!.matchIndex).toBe(1);
          expect(path2[totalRounds - 1]!.matchIndex).toBe(1);
        }
      }
    });
  });

  describe('Conservation and Unique Seeding across regional qualifiers', () => {
    it('conserves all participants and eliminates duplicates through regional qualifiers', () => {
      const oddMultiRounds = [201, 203, 301, 501, 1001];

      for (const n of oddMultiRounds) {
        const plan = calculateTournamentFormat(n);
        expect(plan.hasPreliminary).toBe(true);
        expect(plan.regionalPlan).toBeDefined();

        let totalEliminated = 0;
        for (const reg of plan.regionalPlan!.regions) {
          totalEliminated += reg.matchCount; // Each match eliminates exactly 1 bot
        }

        // Total eliminated bots + bots entering group stage (128) must strictly equal initial bot count n
        expect(totalEliminated + plan.botsEnteringGroupStage).toBe(n);

        // All participants in group stage must be unique
        const allGroupParticipants = plan.groupStage!.groups.flatMap(g => g.participants);
        expect(new Set(allGroupParticipants).size).toBe(plan.botsEnteringGroupStage);
      }
    });
  });

  describe('Production API 64-bot boundary safety', () => {
    it('preserves MAX_PARTICIPANTS = 64 constant for production API', () => {
      expect(MAX_PARTICIPANTS).toBe(64);
    });
  });
});

