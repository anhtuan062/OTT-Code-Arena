/**
 * Tournament Auto-Format Scheduler
 *
 * Implements Phase 1 auto-format planning for OTT Code Arena:
 * - Direct group stage when participants <= 200 and groups can be validly partitioned.
 * - Preliminary elimination rounds (P1, P2, ...) halving the field by ~50% each round when participants > 200,
 *   until participant count is <= 200.
 * - Group stage: 4-8 bots per group, number of groups must be a power of 2 (2^k).
 * - Balanced bot distribution across groups with max difference of 1 bot per group.
 * - Top 2 from each group advance to a knockout bracket (size = 2 * G, guaranteed power of 2).
 * - Optimization objective: minimize total Docker matches while avoiding unnecessary preliminaries.
 * - Deterministic policies for odd bot counts, byes, and edge cases (no arbitrary bot elimination).
 */

import {
  TournamentParticipant,
  TournamentRound,
} from './types.js';
import { generateRoundRobinSchedule } from './scheduling.js';

export interface AutoFormatOptions {
  /** Maximum participants allowed in group stage without preliminary rounds (default: 200) */
  maxGroupStageParticipants?: number;
  /** Minimum bots per group (default: 4) */
  minGroupSize?: number;
  /** Maximum bots per group (default: 8) */
  maxGroupSize?: number;
  /** Top bots advancing per group to knockout bracket (default: 2) */
  qualifiersPerGroup?: number;
  /** Number of independent regions when botCount > maxGroupStageParticipants (default: 4) */
  regionCount?: number;
  /** Target qualifiers per region (default: 32) */
  qualifiersPerRegion?: number;
}

export interface PreliminaryPairing {
  pairingId: string;
  participantA: string;
  participantB: string | null;
  isBye: boolean;
}

export interface PreliminaryRoundPlan {
  roundIndex: number;
  roundName: string;
  incomingBotCount: number;
  outgoingBotCount: number;
  matchCount: number;
  byeCount: number;
  pairings: PreliminaryPairing[];
}

export interface RegionPlan {
  regionId: string;
  name: string;
  regionIndex: number;
  incomingBotCount: number;
  /** Configured upper bound; qualifierCount is the actual survivors after knockout rounds. */
  qualifierLimit: number;
  qualifierCount: number;
  matchCount: number;
  participants: string[];
  rounds: PreliminaryRoundPlan[];
  qualifierPlaceholders: string[];
}

export interface RegionalPlan {
  regionCount: number;
  totalIncomingBots: number;
  totalQualifiers: number;
  totalMatches: number;
  regions: RegionPlan[];
}

export interface GroupPlan {
  groupId: string;
  groupIndex: number;
  botCount: number;
  participants: string[];
  matchCount: number;
  rounds?: TournamentRound[];
}

export interface GroupStagePlan {
  groupCount: number;
  botCount: number;
  minGroupSize: number;
  maxGroupSize: number;
  totalMatches: number;
  advancingCount: number;
  groups: GroupPlan[];
}

export interface KnockoutPairing {
  matchIndex: number;
  pairingId: string;
  participantA: string;
  participantB: string | null;
  isBye: boolean;
}

export interface KnockoutRoundPlan {
  roundIndex: number;
  roundName: string;
  botCount: number;
  matchCount: number;
  pairings: KnockoutPairing[];
}

export interface KnockoutBracketPlan {
  bracketSize: number;
  totalMatches: number;
  rounds: KnockoutRoundPlan[];
}

export interface TournamentPlan {
  initialBotCount: number;
  hasPreliminary: boolean;
  preliminaryRounds: PreliminaryRoundPlan[];
  regionalPlan?: RegionalPlan | null;
  botsEnteringGroupStage: number;
  groupStage: GroupStagePlan | null;
  knockoutBracket: KnockoutBracketPlan;
  totalDockerMatches: number;
  explanation: string;
}

/** Check if an integer is a positive power of 2 (1, 2, 4, 8, 16, 32, 64, ...) */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Returns all valid group counts G (powers of 2) such that:
 * 4 <= floor(botCount / G) <= ceil(botCount / G) <= 8
 */
export function getValidGroupCounts(
  botCount: number,
  minGroupSize = 4,
  maxGroupSize = 8
): number[] {
  if (botCount < minGroupSize) return [];
  const validCounts: number[] = [];

  for (let k = 0; k <= 10; k++) {
    const G = 1 << k; // 2^k
    const minSize = Math.floor(botCount / G);
    const maxSize = Math.ceil(botCount / G);

    if (minSize >= minGroupSize && maxSize <= maxGroupSize) {
      validCounts.push(G);
    }
  }

  return validCounts;
}

/**
 * Calculate total group stage matches for botCount partitioned into G groups.
 * In a group of size s, single round-robin has s*(s-1)/2 matches.
 */
export function calculateGroupStageMatches(botCount: number, groupCount: number): number {
  if (groupCount <= 0) return 0;
  const baseSize = Math.floor(botCount / groupCount);
  const remainder = botCount % groupCount;
  const matchesPerBase = (baseSize * (baseSize - 1)) / 2;
  const matchesPerLarge = ((baseSize + 1) * baseSize) / 2;
  return remainder * matchesPerLarge + (groupCount - remainder) * matchesPerBase;
}

/**
 * Select optimal group count G (power of 2) that minimizes total Docker matches
 * (group stage matches + knockout bracket matches).
 * If total matches are tied, chooses the larger G (smaller groups parallelize better).
 */
export function selectOptimalGroupCount(
  botCount: number,
  minGroupSize = 4,
  maxGroupSize = 8,
  qualifiersPerGroup = 2
): number | null {
  const validCounts = getValidGroupCounts(botCount, minGroupSize, maxGroupSize);
  if (validCounts.length === 0) return null;

  let bestG = validCounts[0]!;
  let minTotalMatches = Infinity;

  for (const G of validCounts) {
    const groupMatches = calculateGroupStageMatches(botCount, G);
    const knockoutParticipants = G * qualifiersPerGroup;
    const knockoutMatches = knockoutParticipants - 1; // single elimination knockout matches
    const totalMatches = groupMatches + knockoutMatches;

    if (totalMatches < minTotalMatches || (totalMatches === minTotalMatches && G > bestG)) {
      minTotalMatches = totalMatches;
      bestG = G;
    }
  }

  return bestG;
}

/**
 * Normalize participant inputs into an array of string participant IDs.
 */
export function normalizeParticipants(
  input: number | string[] | TournamentParticipant[]
): string[] {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 2) {
      throw new Error(`Tournament requires at least 2 participants, received ${input}`);
    }
    const padLen = Math.max(2, String(input).length);
    return Array.from({ length: input }, (_, i) => `bot-${String(i + 1).padStart(padLen, '0')}`);
  }

  if (!Array.isArray(input) || input.length < 2) {
    throw new Error(`Tournament requires at least 2 participants, received ${input?.length ?? 0}`);
  }

  return input.map(item => (typeof item === 'string' ? item : item.participantId));
}

/**
 * Generate preliminary elimination plan.
 * Halves the field by ~50% each round until participant count is <= maxGroupStageBots.
 * Deterministic bye policy:
 * When incoming bot count is odd, the top seed (index 0) receives a bye and advances.
 * Remaining bots are paired via fold pairing (seed i vs seed M - 1 - i).
 */
export function generatePreliminaryPlan(
  participants: string[],
  maxGroupStageBots = 200
): {
  preliminaryRounds: PreliminaryRoundPlan[];
  remainingParticipants: string[];
} {
  const preliminaryRounds: PreliminaryRoundPlan[] = [];
  let currentBots = [...participants];
  let roundIdx = 1;

  while (currentBots.length > maxGroupStageBots) {
    const incomingCount = currentBots.length;
    const isOdd = incomingCount % 2 === 1;
    const matchCount = Math.floor(incomingCount / 2);
    const pairings: PreliminaryPairing[] = [];
    const nextBots: string[] = [];

    let playParticipants: string[];
    if (isOdd) {
      // Top seed gets a bye
      const byeBot = currentBots[0]!;
      nextBots.push(byeBot);
      pairings.push({
        pairingId: `P${roundIdx}-bye-1`,
        participantA: byeBot,
        participantB: null,
        isBye: true,
      });
      playParticipants = currentBots.slice(1);
    } else {
      playParticipants = currentBots;
    }

    // Fold pairing for remaining participants
    const pCount = playParticipants.length;
    for (let i = 0; i < pCount / 2; i++) {
      const a = playParticipants[i]!;
      const b = playParticipants[pCount - 1 - i]!;
      pairings.push({
        pairingId: `P${roundIdx}-m${i + 1}`,
        participantA: a,
        participantB: b,
        isBye: false,
      });
      // Deterministic slot progression indicator for stage planning:
      // Does not assign identity of a or b before match is played
      nextBots.push(`P${roundIdx}-m${i + 1}-winner`);
    }

    preliminaryRounds.push({
      roundIndex: roundIdx,
      roundName: `P${roundIdx}`,
      incomingBotCount: incomingCount,
      outgoingBotCount: nextBots.length,
      matchCount,
      byeCount: isOdd ? 1 : 0,
      pairings,
    });

    currentBots = nextBots;
    roundIdx++;
  }

  return {
    preliminaryRounds,
    remainingParticipants: currentBots,
  };
}

/**
 * Distribute participants into R independent regions using snake draft seeding.
 * Ensures balanced distribution where every region differs in size by at most 1 bot.
 */
export function distributeParticipantsToRegions(
  participants: string[],
  regionCount = 4
): string[][] {
  const regions: string[][] = Array.from({ length: regionCount }, () => []);
  for (let i = 0; i < participants.length; i++) {
    const round = Math.floor(i / regionCount);
    const indexInRound = i % regionCount;
    const regionIndex = round % 2 === 0 ? indexInRound : regionCount - 1 - indexInRound;
    regions[regionIndex]!.push(participants[i]!);
  }
  return regions;
}

/**
 * Generate a single elimination bracket plan for a single region.
 * Halves the field until at most qualifierCount bots remain, without playing
 * a regional final or crowning a regional champion. Each round pairs every
 * available bot; only one top seed receives a bye when the field is odd.
 */
export function generateRegionEliminationPlan(
  regionId: string,
  regionIndex: number,
  participants: string[],
  qualifierCount = 32
): RegionPlan {
  const n = participants.length;
  if (n <= qualifierCount) {
    return {
      regionId,
      name: `Region ${regionIndex}`,
      regionIndex,
      incomingBotCount: n,
      qualifierLimit: qualifierCount,
      qualifierCount: n,
      matchCount: 0,
      participants,
      rounds: [],
      qualifierPlaceholders: participants,
    };
  }

  const rounds: PreliminaryRoundPlan[] = [];
  let currentBots = [...participants];
  let roundIdx = 1;

  while (currentBots.length > qualifierCount) {
    const C = currentBots.length;
    const byeCount = C % 2;
    const matchCount = Math.floor(C / 2);
    const pairings: PreliminaryPairing[] = [];
    const nextBots: string[] = [];

    // Deterministic bye policy: top seeds receive byes
    for (let b = 0; b < byeCount; b++) {
      const byeBot = currentBots[b]!;
      nextBots.push(byeBot);
      pairings.push({
        pairingId: `R${regionIndex}-r${roundIdx}-bye-${b + 1}`,
        participantA: byeBot,
        participantB: null,
        isBye: true,
      });
    }

    // Remaining bots play adjacent knockout matches.
    const playingBots = currentBots.slice(byeCount);
    for (let m = 0; m < matchCount; m++) {
      const a = playingBots[m * 2]!;
      const b = playingBots[m * 2 + 1]!;
      const pairingId = `R${regionIndex}-r${roundIdx}-m${m + 1}`;
      pairings.push({
        pairingId,
        participantA: a,
        participantB: b,
        isBye: false,
      });
      // Slot placeholder for winner (identity only resolved when match commits)
      nextBots.push(`${pairingId}-winner`);
    }

    rounds.push({
      roundIndex: roundIdx,
      roundName: `Region ${regionIndex} - Round ${roundIdx}`,
      incomingBotCount: C,
      outgoingBotCount: nextBots.length,
      matchCount,
      byeCount,
      pairings,
    });

    currentBots = nextBots;
    roundIdx++;
  }

  const matchCount = rounds.reduce((acc, r) => acc + r.matchCount, 0);

  const finalQualifierCount = currentBots.length;

  // Qualifier placeholders for Group Stage seeding: Region-r-Q1 ... Region-r-QN
  const qualifierPlaceholders = Array.from(
    { length: finalQualifierCount },
    (_, i) => `Region-${regionIndex}-Q${i + 1}`
  );

  return {
    regionId,
    name: `Region ${regionIndex}`,
    regionIndex,
    incomingBotCount: n,
    qualifierLimit: qualifierCount,
    qualifierCount: finalQualifierCount,
    matchCount,
    participants,
    rounds,
    qualifierPlaceholders,
  };
}

/**
 * Generate regional qualification plan across all independent regions.
 */
export function generateRegionalPlan(
  participants: string[],
  regionCount = 4,
  qualifiersPerRegion = 32
): RegionalPlan {
  const distributed = distributeParticipantsToRegions(participants, regionCount);
  const regions: RegionPlan[] = [];
  let totalMatches = 0;
  let totalQualifiers = 0;

  for (let r = 0; r < regionCount; r++) {
    const regionBots = distributed[r]!;
    const regionPlan = generateRegionEliminationPlan(
      `region-${r + 1}`,
      r + 1,
      regionBots,
      qualifiersPerRegion
    );
    regions.push(regionPlan);
    totalMatches += regionPlan.matchCount;
    totalQualifiers += regionPlan.qualifierCount;
  }

  return {
    regionCount,
    totalIncomingBots: participants.length,
    totalQualifiers,
    totalMatches,
    regions,
  };
}

/**
 * Distribute participants into G groups using snake draft seeding.
 * Ensures balanced distribution where every group differs in size by at most 1 bot.
 */
export function distributeParticipantsToGroups(
  participants: string[],
  groupCount: number
): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);

  for (let i = 0; i < participants.length; i++) {
    const round = Math.floor(i / groupCount);
    const indexInRound = i % groupCount;
    const groupIndex = round % 2 === 0 ? indexInRound : groupCount - 1 - indexInRound;
    groups[groupIndex]!.push(participants[i]!);
  }

  return groups;
}

/**
 * Generate group stage plan.
 */
export function generateGroupStagePlan(
  participants: string[],
  groupCount: number,
  includeSchedules = true
): GroupStagePlan {
  const distributed = distributeParticipantsToGroups(participants, groupCount);
  const groups: GroupPlan[] = [];
  let totalMatches = 0;

  for (let g = 0; g < groupCount; g++) {
    const groupBots = distributed[g]!;
    const botCount = groupBots.length;
    const matchCount = (botCount * (botCount - 1)) / 2;
    totalMatches += matchCount;

    let rounds: TournamentRound[] | undefined;
    if (includeSchedules && botCount >= 2) {
      const dummyParticipants: TournamentParticipant[] = groupBots.map(id => ({
        participantId: id,
        name: id,
        bot: { botId: id, player: 'A', command: 'node', args: [] },
        registeredAt: new Date(0).toISOString(),
      }));
      rounds = generateRoundRobinSchedule(dummyParticipants);
    }

    // Letter labeling: A, B, ..., Z, AA, AB...
    const label = g < 26 ? String.fromCharCode(65 + g) : `G${g + 1}`;

    groups.push({
      groupId: `Group-${label}`,
      groupIndex: g + 1,
      botCount,
      participants: groupBots,
      matchCount,
      rounds,
    });
  }

  const sizes = groups.map(g => g.botCount);
  const minGroupSize = Math.min(...sizes);
  const maxGroupSize = Math.max(...sizes);

  return {
    groupCount,
    botCount: participants.length,
    minGroupSize,
    maxGroupSize,
    totalMatches,
    advancingCount: groupCount * 2,
    groups,
  };
}

/**
 * Generate knockout round name based on remaining bot count.
 */
function getKnockoutRoundName(botCount: number): string {
  switch (botCount) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinals';
    case 8:
      return 'Quarterfinals';
    default:
      return `Round of ${botCount}`;
  }
}

/**
 * Generate knockout bracket plan.
 * Top 2 from each group advance. Group winners play runners-up from different groups.
 */
export function generateKnockoutPlan(
  groupStageOrCount: GroupStagePlan | number | string[]
): KnockoutBracketPlan {
  let bracketSize: number;
  let initialPairings: KnockoutPairing[] = [];

  if (typeof groupStageOrCount === 'number') {
    bracketSize = groupStageOrCount;
    const half = bracketSize / 2;
    for (let i = 0; i < half; i++) {
      initialPairings.push({
        matchIndex: i + 1,
        pairingId: `KO-r1-m${i + 1}`,
        participantA: `Seed-${2 * i + 1}`,
        participantB: `Seed-${2 * i + 2}`,
        isBye: false,
      });
    }
  } else if (Array.isArray(groupStageOrCount)) {
    bracketSize = groupStageOrCount.length;
    const half = bracketSize / 2;
    for (let i = 0; i < half; i++) {
      initialPairings.push({
        matchIndex: i + 1,
        pairingId: `KO-r1-m${i + 1}`,
        participantA: groupStageOrCount[2 * i] ?? `Slot-${2 * i + 1}`,
        participantB: groupStageOrCount[2 * i + 1] ?? `Slot-${2 * i + 2}`,
        isBye: false,
      });
    }
  } else {
    // Structured GroupStagePlan:
    // Group winners play runners-up from opposite groups to avoid premature rematches
    const G = groupStageOrCount.groupCount;
    bracketSize = G * 2;

    for (let i = 0; i < G; i++) {
      const winnerGroup = groupStageOrCount.groups[i]!;
      // Cross-pair winner of group i with runner-up of group (i + G/2) % G
      const runnerUpGroupIndex = (i + Math.max(1, Math.floor(G / 2))) % G;
      const runnerUpGroup = groupStageOrCount.groups[runnerUpGroupIndex]!;

      initialPairings.push({
        matchIndex: i + 1,
        pairingId: `KO-r1-m${i + 1}`,
        participantA: `1st-${winnerGroup.groupId}`,
        participantB: `2nd-${runnerUpGroup.groupId}`,
        isBye: false,
      });
    }
  }

  // Build rounds
  const rounds: KnockoutRoundPlan[] = [];
  let currentBotCount = bracketSize;
  let currentPairings = initialPairings;
  let roundIdx = 1;

  while (currentBotCount > 1) {
    const matchCount = currentBotCount / 2;
    rounds.push({
      roundIndex: roundIdx,
      roundName: getKnockoutRoundName(currentBotCount),
      botCount: currentBotCount,
      matchCount,
      pairings: currentPairings,
    });

    currentBotCount = matchCount;
    roundIdx++;

    if (currentBotCount > 1) {
      const nextPairings: KnockoutPairing[] = [];
      const nextMatchCount = currentBotCount / 2;
      for (let m = 0; m < nextMatchCount; m++) {
        nextPairings.push({
          matchIndex: m + 1,
          pairingId: `KO-r${roundIdx}-m${m + 1}`,
          participantA: `winner(KO-r${roundIdx - 1}-m${2 * m + 1})`,
          participantB: `winner(KO-r${roundIdx - 1}-m${2 * m + 2})`,
          isBye: false,
        });
      }
      currentPairings = nextPairings;
    }
  }

  const totalMatches = bracketSize - 1;

  return {
    bracketSize,
    totalMatches,
    rounds,
  };
}

export interface ChampionPathStep {
  roundIndex: number;
  roundName: string;
  matchIndex: number;
  pairingId: string;
}

/**
 * Trace the theoretical champion path through the bracket rounds
 * for a participant starting at a specific match index in Round 1.
 */
export function traceChampionPath(
  round1MatchIndex: number,
  bracket: KnockoutBracketPlan
): ChampionPathStep[] {
  const path: ChampionPathStep[] = [];
  let currentMatch = round1MatchIndex;

  for (const round of bracket.rounds) {
    const pairing = round.pairings.find(p => p.matchIndex === currentMatch);
    path.push({
      roundIndex: round.roundIndex,
      roundName: round.roundName,
      matchIndex: currentMatch,
      pairingId: pairing?.pairingId ?? `KO-r${round.roundIndex}-m${currentMatch}`,
    });
    currentMatch = Math.ceil(currentMatch / 2);
  }

  return path;
}

/**
 * Find the knockout round (1-indexed) where two competitors starting in Round 1
 * can first meet in the bracket tree.
 * In a valid bracket with no premature rematches, 1st and 2nd from the same group
 * must have meetingRound === totalRounds (the Final).
 */
export function findMeetingRound(
  round1MatchA: number,
  round1MatchB: number
): number {
  let round = 1;
  let mA = round1MatchA;
  let mB = round1MatchB;
  while (mA !== mB) {
    mA = Math.ceil(mA / 2);
    mB = Math.ceil(mB / 2);
    round++;
  }
  return round;
}

/**
 * Handle small participant counts (< 4 bots) deterministically without group stage.
 */
function handleSmallBotCounts(participants: string[]): TournamentPlan {
  const n = participants.length;
  if (n === 2) {
    const rounds: KnockoutRoundPlan[] = [
      {
        roundIndex: 1,
        roundName: 'Final',
        botCount: 2,
        matchCount: 1,
        pairings: [
          {
            matchIndex: 1,
            pairingId: 'KO-final-m1',
            participantA: participants[0]!,
            participantB: participants[1]!,
            isBye: false,
          },
        ],
      },
    ];
    return {
      initialBotCount: 2,
      hasPreliminary: false,
      preliminaryRounds: [],
      botsEnteringGroupStage: 0,
      groupStage: null,
      knockoutBracket: {
        bracketSize: 2,
        totalMatches: 1,
        rounds,
      },
      totalDockerMatches: 1,
      explanation: '2 bots: direct 1-match Final knockout bracket.',
    };
  }

  if (n === 3) {
    // Seed 1 gets bye to Final; Seed 2 vs Seed 3 play Semifinal.
    const rounds: KnockoutRoundPlan[] = [
      {
        roundIndex: 1,
        roundName: 'Semifinals',
        botCount: 3,
        matchCount: 1,
        pairings: [
          {
            matchIndex: 1,
            pairingId: 'KO-sf-m1',
            participantA: participants[1]!,
            participantB: participants[2]!,
            isBye: false,
          },
          {
            matchIndex: 2,
            pairingId: 'KO-sf-bye',
            participantA: participants[0]!,
            participantB: null,
            isBye: true,
          },
        ],
      },
      {
        roundIndex: 2,
        roundName: 'Final',
        botCount: 2,
        matchCount: 1,
        pairings: [
          {
            matchIndex: 1,
            pairingId: 'KO-final-m1',
            participantA: participants[0]!,
            participantB: 'KO-sf-m1-winner',
            isBye: false,
          },
        ],
      },
    ];
    return {
      initialBotCount: 3,
      hasPreliminary: false,
      preliminaryRounds: [],
      botsEnteringGroupStage: 0,
      groupStage: null,
      knockoutBracket: {
        bracketSize: 3,
        totalMatches: 2,
        rounds,
      },
      totalDockerMatches: 2,
      explanation: '3 bots: Seed 1 gets bye, Seed 2 vs Seed 3 in Semifinal, winner plays Final (2 matches total).',
    };
  }

  throw new Error(`Tournament requires at least 2 participants, received ${n}`);
}

/**
 * Main Tournament Auto-Format Planning Engine.
 *
 * Implements full Phase 1 rules:
 * - If botCount <= 200 and groups can be validly partitioned, preliminary is skipped.
 * - If botCount > 200, preliminary rounds P1, P2, ... are generated (halving by ~50% each round)
 *   until remaining bots <= 200.
 * - Group stage: 4-8 bots/group, groupCount = 2^k.
 * - Balanced bot distribution (max difference of 1 bot per group).
 * - Top 2 advance to knockout bracket (bracketSize = 2 * G = 2^(k+1)).
 * - Minimizes total Docker matches.
 * - Deterministic policies for odd counts and byes.
 */
export function calculateTournamentFormat(
  input: number | string[] | TournamentParticipant[],
  options: AutoFormatOptions = {}
): TournamentPlan {
  const maxGroupStageBots = options.maxGroupStageParticipants ?? 200;
  const minGroupSize = options.minGroupSize ?? 4;
  const maxGroupSize = options.maxGroupSize ?? 8;
  const qualifiersPerGroup = options.qualifiersPerGroup ?? 2;

  const participants = normalizeParticipants(input);
  const initialBotCount = participants.length;

  // Handle small participant counts (< 4 bots)
  if (initialBotCount < minGroupSize) {
    return handleSmallBotCounts(participants);
  }

  let preliminaryRounds: PreliminaryRoundPlan[] = [];
  let botsForGroupStage = participants;
  let hasPreliminary = false;
  let regionalPlan: RegionalPlan | null = null;

  // Rule: If > 200 bots, create regional qualifiers (R independent regions, default R=4)
  if (initialBotCount > maxGroupStageBots) {
    hasPreliminary = true;
    const regionCount = options.regionCount ?? 4;
    const qualifiersPerRegion = options.qualifiersPerRegion ?? 32;

    regionalPlan = generateRegionalPlan(participants, regionCount, qualifiersPerRegion);
    preliminaryRounds = regionalPlan.regions.flatMap(r => r.rounds);

    // Pool qualifiers from all regions: [Region-1-Q1..Q32, Region-2-Q1..Q32, ...]
    const pooledGroupBots: string[] = [];
    for (const region of regionalPlan.regions) {
      pooledGroupBots.push(...region.qualifierPlaceholders);
    }
    botsForGroupStage = pooledGroupBots;
  }

  const groupBotCount = botsForGroupStage.length;
  const optimalG = selectOptimalGroupCount(groupBotCount, minGroupSize, maxGroupSize, qualifiersPerGroup);

  if (optimalG === null) {
    throw new Error(
      `Cannot partition ${groupBotCount} bots into valid groups of ${minGroupSize}-${maxGroupSize} bots with a power-of-2 group count`
    );
  }

  // Generate Group Stage Plan
  const groupStage = generateGroupStagePlan(botsForGroupStage, optimalG);

  // Generate Knockout Bracket Plan
  const knockoutBracket = generateKnockoutPlan(groupStage);

  // Calculate total Docker matches
  const prelimMatches = regionalPlan
    ? regionalPlan.totalMatches
    : preliminaryRounds.reduce((acc, r) => acc + r.matchCount, 0);
  const groupMatches = groupStage.totalMatches;
  const knockoutMatches = knockoutBracket.totalMatches;
  const totalDockerMatches = prelimMatches + groupMatches + knockoutMatches;

  // Explanation
  const explanationParts: string[] = [];
  explanationParts.push(`Initial: ${initialBotCount} bots.`);
  if (regionalPlan) {
    explanationParts.push(
      `Regional Qualifiers: ${regionalPlan.regionCount} independent regions (${prelimMatches} matches) qualified ${regionalPlan.totalQualifiers} bots for Group Stage.`
    );
  } else if (hasPreliminary) {
    explanationParts.push(
      `Preliminary: ${preliminaryRounds.length} round(s) (${prelimMatches} matches) reduced field to ${groupBotCount} bots.`
    );
  } else {
    explanationParts.push(`Preliminary skipped: ${initialBotCount} bots <= ${maxGroupStageBots} and cleanly partitionable.`);
  }
  explanationParts.push(
    `Group Stage: ${optimalG} groups (${groupStage.minGroupSize}-${groupStage.maxGroupSize} bots/group, ${groupMatches} matches).`
  );
  explanationParts.push(
    `Knockout Bracket: Top 2 from each group advance -> ${knockoutBracket.bracketSize} bots (${knockoutMatches} matches).`
  );
  explanationParts.push(`Total Docker matches: ${totalDockerMatches}.`);

  return {
    initialBotCount,
    hasPreliminary,
    preliminaryRounds,
    regionalPlan,
    botsEnteringGroupStage: groupBotCount,
    groupStage,
    knockoutBracket,
    totalDockerMatches,
    explanation: explanationParts.join(' '),
  };
}

/**
 * Validate a TournamentPlan against all tournament auto-format invariants.
 */
export function validateTournamentPlan(plan: TournamentPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check small bot count special cases
  if (plan.initialBotCount < 4) {
    if (plan.hasPreliminary) {
      errors.push(`Bot count ${plan.initialBotCount} should not have preliminary rounds`);
    }
    if (plan.groupStage !== null) {
      errors.push(`Bot count ${plan.initialBotCount} should not have group stage`);
    }
    if (plan.knockoutBracket.bracketSize !== plan.initialBotCount) {
      errors.push(`Expected knockout bracket size ${plan.initialBotCount}, got ${plan.knockoutBracket.bracketSize}`);
    }
    return { valid: errors.length === 0, errors };
  }

  // Preliminary / Regional validation
  if (plan.initialBotCount > 200) {
    if (!plan.hasPreliminary) {
      errors.push(`Bot count ${plan.initialBotCount} > 200 must have preliminary / regional qualifiers`);
    }

    if (plan.regionalPlan) {
      const rp = plan.regionalPlan;
      if (!isPowerOfTwo(rp.regionCount)) {
        errors.push(`Region count ${rp.regionCount} is not a power of 2`);
      }
      if (rp.regions.length !== rp.regionCount) {
        errors.push(`Expected ${rp.regionCount} regions, got ${rp.regions.length}`);
      }

      const sizes = rp.regions.map(r => r.incomingBotCount);
      const minSize = Math.min(...sizes);
      const maxSize = Math.max(...sizes);
      if (maxSize - minSize > 1) {
        errors.push(`Region size imbalance exceeds 1 bot: min=${minSize}, max=${maxSize}`);
      }

      const totalBotsInRegions = sizes.reduce((a, b) => a + b, 0);
      if (totalBotsInRegions !== plan.initialBotCount) {
        errors.push(`Sum of bots across regions (${totalBotsInRegions}) != initial bot count (${plan.initialBotCount})`);
      }

      let totalRegionalMatches = 0;
      for (const reg of rp.regions) {
        if (reg.incomingBotCount > reg.qualifierCount) {
          const expectedMatches = reg.incomingBotCount - reg.qualifierCount;
          if (reg.matchCount !== expectedMatches) {
            errors.push(`Region ${reg.name} expected ${expectedMatches} matches, got ${reg.matchCount}`);
          }
        }
        totalRegionalMatches += reg.matchCount;
      }

      if (rp.totalMatches !== totalRegionalMatches) {
        errors.push(`Regional plan total matches ${rp.totalMatches} != sum of region matches (${totalRegionalMatches})`);
      }

      const groupStageMinimum = plan.groupStage ? plan.groupStage.groupCount * (plan.groupStage.minGroupSize || 4) : 4;
      const groupStageMaximum = plan.groupStage ? plan.groupStage.groupCount * (plan.groupStage.maxGroupSize || 8) : 200;
      if (plan.botsEnteringGroupStage < groupStageMinimum || plan.botsEnteringGroupStage > groupStageMaximum) {
        errors.push(`Bots entering group stage ${plan.botsEnteringGroupStage} not in range [${groupStageMinimum}, ${groupStageMaximum}]`);
      }
    } else {
      if (plan.preliminaryRounds.length === 0) {
        errors.push('Preliminary rounds array cannot be empty when hasPreliminary is true');
      }
      let prevOut = plan.initialBotCount;
      for (const pr of plan.preliminaryRounds) {
        if (pr.incomingBotCount !== prevOut) {
          errors.push(`Preliminary round ${pr.roundName} incoming count ${pr.incomingBotCount} != previous outgoing ${prevOut}`);
        }
        const expectedMatches = Math.floor(pr.incomingBotCount / 2);
        if (pr.matchCount !== expectedMatches) {
          errors.push(`Preliminary round ${pr.roundName} expected ${expectedMatches} matches, got ${pr.matchCount}`);
        }
        const expectedByes = pr.incomingBotCount % 2;
        if (pr.byeCount !== expectedByes) {
          errors.push(`Preliminary round ${pr.roundName} expected ${expectedByes} byes, got ${pr.byeCount}`);
        }
        const expectedOut = expectedMatches + expectedByes;
        if (pr.outgoingBotCount !== expectedOut) {
          errors.push(`Preliminary round ${pr.roundName} expected ${expectedOut} outgoing bots, got ${pr.outgoingBotCount}`);
        }
        prevOut = pr.outgoingBotCount;
      }
      if (plan.botsEnteringGroupStage > 200) {
        errors.push(`Bots entering group stage must be <= 200, got ${plan.botsEnteringGroupStage}`);
      }
    }
  } else {
    if (plan.hasPreliminary) {
      errors.push(`Bot count ${plan.initialBotCount} <= 200 should skip preliminary`);
    }
    if (plan.botsEnteringGroupStage !== plan.initialBotCount) {
      errors.push(`Expected ${plan.initialBotCount} bots in group stage, got ${plan.botsEnteringGroupStage}`);
    }
  }

  // Group Stage validation
  const gs = plan.groupStage;
  if (!gs) {
    errors.push('Group stage plan is missing');
  } else {
    // Group count must be power of 2
    if (!isPowerOfTwo(gs.groupCount)) {
      errors.push(`Group count ${gs.groupCount} is not a power of 2`);
    }

    // Bot distribution balance
    if (gs.maxGroupSize - gs.minGroupSize > 1) {
      errors.push(`Group size difference exceeds 1: min=${gs.minGroupSize}, max=${gs.maxGroupSize}`);
    }

    // Group size bounds: 4 to 8
    if (gs.minGroupSize < 4) {
      errors.push(`Minimum group size ${gs.minGroupSize} is less than 4`);
    }
    if (gs.maxGroupSize > 8) {
      errors.push(`Maximum group size ${gs.maxGroupSize} exceeds 8`);
    }

    // Check sum of group bots
    const totalGroupBots = gs.groups.reduce((acc, g) => acc + g.botCount, 0);
    if (totalGroupBots !== plan.botsEnteringGroupStage) {
      errors.push(`Sum of bots across groups (${totalGroupBots}) != bots entering group stage (${plan.botsEnteringGroupStage})`);
    }

    // Check individual groups
    const seenParticipants = new Set<string>();
    for (const group of gs.groups) {
      if (group.botCount < 4 || group.botCount > 8) {
        errors.push(`Group ${group.groupId} size ${group.botCount} is out of bounds [4, 8]`);
      }
      const expectedMatches = (group.botCount * (group.botCount - 1)) / 2;
      if (group.matchCount !== expectedMatches) {
        errors.push(`Group ${group.groupId} expected ${expectedMatches} matches, got ${group.matchCount}`);
      }
      for (const p of group.participants) {
        if (seenParticipants.has(p)) {
          errors.push(`Participant ${p} assigned to multiple groups`);
        }
        seenParticipants.add(p);
      }
    }

    // Check knockout bracket from group stage
    const expectedAdvancing = gs.groupCount * 2;
    if (gs.advancingCount !== expectedAdvancing) {
      errors.push(`Expected ${expectedAdvancing} advancing bots, got ${gs.advancingCount}`);
    }

    const ko = plan.knockoutBracket;
    if (ko.bracketSize !== expectedAdvancing) {
      errors.push(`Knockout bracket size ${ko.bracketSize} != advancing bots ${expectedAdvancing}`);
    }
    if (!isPowerOfTwo(ko.bracketSize)) {
      errors.push(`Knockout bracket size ${ko.bracketSize} is not a power of 2`);
    }
    if (ko.totalMatches !== ko.bracketSize - 1) {
      errors.push(`Knockout bracket expected ${ko.bracketSize - 1} matches, got ${ko.totalMatches}`);
    }

    // Verify anti-rematch invariant: Top 2 from the same group can never meet before the Final
    const r1Pairings = plan.knockoutBracket.rounds[0]?.pairings ?? [];
    const totalKnockoutRounds = plan.knockoutBracket.rounds.length;

    for (const group of gs.groups) {
      const winnerTag = `1st-${group.groupId}`;
      const runnerUpTag = `2nd-${group.groupId}`;

      const match1 = r1Pairings.find(
        p => p.participantA === winnerTag || p.participantB === winnerTag
      );
      const match2 = r1Pairings.find(
        p => p.participantA === runnerUpTag || p.participantB === runnerUpTag
      );

      if (match1 && match2) {
        const meetingRound = findMeetingRound(match1.matchIndex, match2.matchIndex);
        if (meetingRound < totalKnockoutRounds) {
          errors.push(
            `Group ${group.groupId} top 2 (${winnerTag} and ${runnerUpTag}) would meet prematurely in round ${meetingRound} (Final is round ${totalKnockoutRounds})`
          );
        }
      }
    }
  }

  // Docker match count sum validation
  const prelimMatches = plan.preliminaryRounds.reduce((acc, r) => acc + r.matchCount, 0);
  const groupMatches = gs ? gs.totalMatches : 0;
  const koMatches = plan.knockoutBracket.totalMatches;
  const expectedTotalMatches = prelimMatches + groupMatches + koMatches;
  if (plan.totalDockerMatches !== expectedTotalMatches) {
    errors.push(`Total matches ${plan.totalDockerMatches} != sum of stages (${expectedTotalMatches})`);
  }

  return { valid: errors.length === 0, errors };
}

