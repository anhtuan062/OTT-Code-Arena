/**
 * Tournament Manager - Scoring and Standings
 *
 * Computes deterministic standings from recorded match results.
 * Handles wins, draws, losses, forfeits, byes, and tiebreaks.
 */

import {
  TournamentParticipant,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentScoringConfig,
  TournamentPairing,
  TournamentRound,
  Player,
  TerminationReason,
  DEFAULT_SCORING_CONFIG,
} from './types.js';

/**
 * Result of a single match from the perspective of a participant
 */
export interface ParticipantMatchResult {
  participantId: string;
  opponentId: string | null;
  isBye: boolean;
  result: 'win' | 'draw' | 'loss' | 'bye';
  points: number;
  terminationReason: TerminationReason | null;
  isForfeit: boolean;
}

/**
 * Analyze a match record from a participant's perspective
 */
export function analyzeMatchForParticipant(
  match: TournamentMatchRecord,
  participantId: string,
  scoringConfig: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): ParticipantMatchResult | null {
  const { participantA, participantB, winner, terminationReason } = match;

  // Check if this participant was in the match
  if (participantA !== participantId && participantB !== participantId) {
    return null;
  }

  // Handle bye
  if (participantB === null) {
    return {
      participantId,
      opponentId: null,
      isBye: true,
      result: 'bye',
      // A bye advances the participant without being a played win and must
      // never award tournament points.
      points: 0,
      terminationReason,
      isForfeit: false,
    };
  }

  const isParticipantA = participantA === participantId;
  const isForfeit = isForfeitTermination(terminationReason);

  let result: 'win' | 'draw' | 'loss';
  let points: number;

  if (winner === 'draw') {
    result = 'draw';
    points = scoringConfig.drawPoints;
  } else if (winner === (isParticipantA ? 'A' : 'B')) {
    result = 'win';
    points = scoringConfig.winPoints;
  } else {
    result = 'loss';
    points = scoringConfig.lossPoints;
  }

  return {
    participantId,
    opponentId: isParticipantA ? participantB : participantA,
    isBye: false,
    result,
    points,
    terminationReason,
    isForfeit,
  };
}

/**
 * Check if a termination reason indicates a forfeit
 */
export function isForfeitTermination(reason: TerminationReason | null): boolean {
  if (!reason) return false;
  return [
    'bot_timeout',
    'bot_compilation_failed',
    'bot_crash',
    'bot_invalid_json',
    'bot_invalid_response',
    'bot_illegal_move',
    'bot_empty_output',
  ].includes(reason);
}

/**
 * Compute all match results for a participant
 */
export function computeParticipantResults(
  participantId: string,
  matchRecords: TournamentMatchRecord[],
  scoringConfig: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): ParticipantMatchResult[] {
  return matchRecords
    .map(m => analyzeMatchForParticipant(m, participantId, scoringConfig))
    .filter((r): r is ParticipantMatchResult => r !== null);
}

/**
 * Compute head-to-head points between two participants
 */
export function computeHeadToHead(
  participantA: string,
  participantB: string,
  matchRecords: TournamentMatchRecord[],
  scoringConfig: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): { aPoints: number; bPoints: number; matchCount: number } {
  const matchesBetween = matchRecords.filter(m =>
    (m.participantA === participantA && m.participantB === participantB) ||
    (m.participantA === participantB && m.participantB === participantA)
  );

  let aPoints = 0;
  let bPoints = 0;

  for (const match of matchesBetween) {
    const aResult = analyzeMatchForParticipant(match, participantA, scoringConfig);
    const bResult = analyzeMatchForParticipant(match, participantB, scoringConfig);
    if (aResult) aPoints += aResult.points;
    if (bResult) bPoints += bResult.points;
  }

  return {
    aPoints,
    bPoints,
    matchCount: matchesBetween.length,
  };
}

/**
 * Compute standings for all participants from match records
 * This is idempotent - recomputing from the same records gives the same result
 */
export function computeStandings(
  participants: TournamentParticipant[],
  matchRecords: TournamentMatchRecord[],
  scoringConfig: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): TournamentStanding[] {
  const standings: TournamentStanding[] = [];

  for (const participant of participants) {
    const results = computeParticipantResults(participant.participantId, matchRecords, scoringConfig);

    const matchesPlayed = results.filter(r => !r.isBye).length;
    const wins = results.filter(r => r.result === 'win').length;
    const draws = results.filter(r => r.result === 'draw').length;
    const losses = results.filter(r => r.result === 'loss').length;
    const forfeits = results.filter(r => r.isForfeit).length;
    const points = results.reduce((sum, r) => sum + r.points, 0);

    // Compute head-to-head points against each opponent
    const tiebreakHeadToHead: Record<string, number> = {};
    for (const opponent of participants) {
      if (opponent.participantId === participant.participantId) continue;
      const h2h = computeHeadToHead(participant.participantId, opponent.participantId, matchRecords, scoringConfig);
      tiebreakHeadToHead[opponent.participantId] = h2h.aPoints;
    }

    standings.push({
      participantId: participant.participantId,
      participantName: participant.name,
      matchesPlayed,
      wins,
      draws,
      losses,
      forfeits,
      points,
      tiebreakHeadToHead,
    });
  }

  return sortStandings(standings, participants, matchRecords, scoringConfig);
}

/**
 * Deterministically sort standings
 *
 * Ordering:
 * 1. Total points (descending)
 * 2. Head-to-head points (descending) - only applies if exactly 2 participants tied
 * 3. Participant ID (ascending) - stable fallback
 */
export function sortStandings(
  standings: TournamentStanding[],
  participants: TournamentParticipant[],
  matchRecords: TournamentMatchRecord[],
  scoringConfig: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): TournamentStanding[] {
  const pointsCount = new Map<number, number>();
  for (const s of standings) {
    pointsCount.set(s.points, (pointsCount.get(s.points) || 0) + 1);
  }

  return [...standings].sort((a, b) => {
    // 1. Total points descending
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    // 2. Head-to-head for exact 2-way tie
    if (a.points === b.points && pointsCount.get(a.points) === 2) {
      const h2h = computeHeadToHead(a.participantId, b.participantId, matchRecords, scoringConfig);
      if (h2h.matchCount > 0 && h2h.aPoints !== h2h.bPoints) {
        return h2h.bPoints - h2h.aPoints; // descending
      }
    }

    // 3. Stable fallback: participant ID ascending
    return a.participantId.localeCompare(b.participantId);
  });
}

/**
 * Get a participant's standing by ID
 */
export function getStanding(
  standings: TournamentStanding[],
  participantId: string
): TournamentStanding | null {
  return standings.find(s => s.participantId === participantId) || null;
}

/**
 * Check if standings are final (all matches completed)
 */
export function areStandingsFinal(
  standings: TournamentStanding[],
  totalExpectedMatches: number
): boolean {
  const totalPlayed = standings.reduce((sum, s) => sum + s.matchesPlayed, 0);
  return totalPlayed >= totalExpectedMatches * 2; // Each match counted twice (once per participant)
}

/**
 * Get tournament statistics summary
 */
export function getTournamentStats(
  participants: TournamentParticipant[],
  matchRecords: TournamentMatchRecord[],
  pairings: TournamentPairing[] = []
): {
  totalParticipants: number;
  totalMatches: number;
  completedMatches: number;
  forfeitMatches: number;
  drawMatches: number;
  averageTurns: number;
  failedMatches: number;
  pendingMatches: number;
  runningMatches: number;
} {
  const completedMatches = matchRecords.length;
  const forfeitMatches = matchRecords.filter(m => isForfeitTermination(m.terminationReason)).length;
  const drawMatches = matchRecords.filter(m => m.winner === 'draw').length;
  const totalTurns = matchRecords.reduce((sum, m) => sum + m.turnCount, 0);
  const averageTurns = completedMatches > 0 ? totalTurns / completedMatches : 0;
  const scheduledPairings = pairings.filter(pairing => pairing.participantB !== null);
  const failedMatches = scheduledPairings.filter(pairing => pairing.status === 'failed').length;
  const pendingMatches = scheduledPairings.filter(pairing => pairing.status === 'scheduled').length;
  const runningMatches = scheduledPairings.filter(pairing => pairing.status === 'in_progress').length;

  return {
    totalParticipants: participants.length,
    totalMatches: scheduledPairings.length || participants.length * (participants.length - 1) / 2,
    completedMatches,
    forfeitMatches,
    drawMatches,
    averageTurns: Math.round(averageTurns * 100) / 100,
    failedMatches,
    pendingMatches,
    runningMatches,
  };
}
