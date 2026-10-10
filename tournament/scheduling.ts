/**
 * Tournament Manager - Round-Robin Scheduling
 *
 * Implements the circle algorithm (Berger tables) for single round-robin tournaments.
 * For n participants:
 * - If n is even: n-1 rounds, n/2 pairings per round
 * - If n is odd: n rounds, (n-1)/2 pairings per round, one bye per round
 */

import {
  TournamentParticipant,
  TournamentRound,
  TournamentPairing,
  TournamentFormat,
  PairingStatus,
  MIN_PARTICIPANTS,
} from './types.js';

/**
 * Generate a single round-robin schedule
 *
 * @param participants List of participants (must have unique IDs)
 * @returns Array of rounds with pairings
 */
export function generateRoundRobinSchedule(
  participants: TournamentParticipant[]
): TournamentRound[] {
  const n = participants.length;
  if (n < 2) {
    throw new Error(`At least 2 participants required for round-robin, got ${n}`);
  }

  const participantIds = participants.map(p => p.participantId);
  const hasOddCount = n % 2 === 1;
  const totalParticipants = hasOddCount ? n + 1 : n; // Add dummy for bye
  const totalRounds = totalParticipants - 1;
  const pairingsPerRound = totalParticipants / 2;

  // Create working array with participant IDs (and null for bye if odd)
  const items: (string | null)[] = [...participantIds];
  if (hasOddCount) {
    items.push(null); // null represents a bye
  }

  const rounds: TournamentRound[] = [];

  for (let round = 0; round < totalRounds; round++) {
    const pairings: TournamentPairing[] = [];

    for (let i = 0; i < pairingsPerRound; i++) {
      const a = items[i] as string | null;
      const b = items[totalParticipants - 1 - i] as string | null;

      // Skip if both are null (shouldn't happen with circle algorithm)
      if (a === null && b === null) continue;

      // Create pairing
      const pairing: TournamentPairing = {
        pairingId: `${participantIds[0]}-r${round + 1}-p${i + 1}`.replace(/[^a-zA-Z0-9-]/g, ''),
        roundNumber: round + 1,
        participantA: a ?? '', // null means bye for A
        participantB: b, // null means bye for B
        status: 'scheduled',
        matchId: null,
        matchResult: null,
        startedAt: null,
        completedAt: null,
      };

      // Normalize: if A is null (bye), swap so participantA is always the real participant
      if (pairing.participantA === '' && pairing.participantB !== null) {
        pairing.participantA = pairing.participantB;
        pairing.participantB = null;
      }

      pairings.push(pairing);
    }

    rounds.push({
      roundNumber: round + 1,
      pairings,
    });

    // Rotate for next round (circle algorithm)
    // Keep first element fixed, rotate rest
    if (totalParticipants > 2) {
      const fixed = items[0] as string | null;
      const rest = items.slice(1);
      const rotated = [rest[rest.length - 1] as string | null, ...rest.slice(0, -1)];
      items[0] = fixed;
      for (let i = 1; i < items.length; i++) {
        items[i] = rotated[i - 1] as string | null;
      }
    }
  }

  return rounds;
}

/**
 * Validate a round-robin schedule for correctness
 */
export function validateRoundRobinSchedule(
  participants: TournamentParticipant[],
  rounds: TournamentRound[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const participantIds = new Set(participants.map(p => p.participantId));
  const totalParticipants = participants.length;
  const hasOddCount = totalParticipants % 2 === 1;
  const expectedRounds = hasOddCount ? totalParticipants : totalParticipants - 1;
  const internalTotal = hasOddCount ? totalParticipants + 1 : totalParticipants; // Add dummy for bye
  const expectedPairingsPerRound = internalTotal / 2;

  // Check round count
  if (rounds.length !== expectedRounds) {
    errors.push(`Expected ${expectedRounds} rounds, got ${rounds.length}`);
  }

  // Track all pairings seen
  const seenPairings = new Set<string>();
  const roundParticipantCounts = new Map<number, Map<string, number>>();

  for (const round of rounds) {
    const roundParticipantCount = new Map<string, number>();

    if (round.pairings.length !== expectedPairingsPerRound) {
      errors.push(`Round ${round.roundNumber}: expected ${expectedPairingsPerRound} pairings, got ${round.pairings.length}`);
    }

    for (const pairing of round.pairings) {
      // Check no self-pairing
      if (pairing.participantA === pairing.participantB && pairing.participantB !== null) {
        errors.push(`Round ${round.roundNumber}: self-pairing for ${pairing.participantA}`);
      }

      // Check participants exist
      if (pairing.participantA && !participantIds.has(pairing.participantA)) {
        errors.push(`Round ${round.roundNumber}: unknown participant ${pairing.participantA}`);
      }
      if (pairing.participantB && !participantIds.has(pairing.participantB)) {
        errors.push(`Round ${round.roundNumber}: unknown participant ${pairing.participantB}`);
      }

      // Check participant appears at most once per round
      if (pairing.participantA) {
        const count = (roundParticipantCount.get(pairing.participantA) || 0) + 1;
        roundParticipantCount.set(pairing.participantA, count);
        if (count > 1) {
          errors.push(`Round ${round.roundNumber}: participant ${pairing.participantA} appears ${count} times`);
        }
      }
      if (pairing.participantB) {
        const count = (roundParticipantCount.get(pairing.participantB) || 0) + 1;
        roundParticipantCount.set(pairing.participantB, count);
        if (count > 1) {
          errors.push(`Round ${round.roundNumber}: participant ${pairing.participantB} appears ${count} times`);
        }
      }

      // Track unique pairings (order-independent)
      if (pairing.participantA && pairing.participantB) {
        const key = [pairing.participantA, pairing.participantB].sort().join('-');
        if (seenPairings.has(key)) {
          errors.push(`Duplicate pairing: ${key} in round ${round.roundNumber}`);
        }
        seenPairings.add(key);
      }
    }

    roundParticipantCounts.set(round.roundNumber, roundParticipantCount);
  }

  // Check total unique pairings
  const expectedTotalPairings = totalParticipants * (totalParticipants - 1) / 2;
  if (seenPairings.size !== expectedTotalPairings) {
    errors.push(`Expected ${expectedTotalPairings} unique pairings, got ${seenPairings.size}`);
  }

  // Check bye distribution for odd count
  if (hasOddCount) {
    const byeCounts = new Map<string, number>();
    for (const round of rounds) {
      for (const pairing of round.pairings) {
        if (pairing.participantB === null && pairing.participantA) {
          byeCounts.set(pairing.participantA, (byeCounts.get(pairing.participantA) || 0) + 1);
        }
      }
    }
    for (const [pid, count] of byeCounts) {
      if (count !== 1) {
        errors.push(`Participant ${pid} has ${count} byes (expected 1)`);
      }
    }
    // Check all participants have exactly one bye
    for (const pid of participantIds) {
      if (!byeCounts.has(pid)) {
        errors.push(`Participant ${pid} has 0 byes (expected 1)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the next eligible pairing to execute
 * Returns the first pairing that is scheduled and not yet completed
 */
export function getNextEligiblePairing(rounds: TournamentRound[]): TournamentPairing | null {
  for (const round of rounds) {
    for (const pairing of round.pairings) {
      if (pairing.status === 'scheduled' && pairing.participantB !== null) {
        return pairing;
      }
    }
  }
  return null;
}

/**
 * Get all scheduled pairings that are not completed
 */
export function getPendingPairings(rounds: TournamentRound[]): TournamentPairing[] {
  const pending: TournamentPairing[] = [];
  for (const round of rounds) {
    for (const pairing of round.pairings) {
      if (pairing.status === 'scheduled' && pairing.participantB !== null) {
        pending.push(pairing);
      }
    }
  }
  return pending;
}

/**
 * Check if all pairings are completed
 */
export function isScheduleComplete(rounds: TournamentRound[]): boolean {
  for (const round of rounds) {
    for (const pairing of round.pairings) {
      if (pairing.participantB !== null && pairing.status !== 'completed') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Find a pairing by ID
 */
export function findPairing(rounds: TournamentRound[], pairingId: string): TournamentPairing | null {
  for (const round of rounds) {
    const found = round.pairings.find(p => p.pairingId === pairingId);
    if (found) return found;
  }
  return null;
}

/**
 * Mark pairing as in progress
 */
export function markPairingInProgress(rounds: TournamentRound[], pairingId: string, matchId: string): boolean {
  const pairing = findPairing(rounds, pairingId);
  if (!pairing) return false;
  if (pairing.status !== 'scheduled') return false;

  pairing.status = 'in_progress';
  pairing.matchId = matchId;
  pairing.startedAt = new Date().toISOString();
  return true;
}

/**
 * Mark pairing as completed with result
 */
export function markPairingCompleted(
  rounds: TournamentRound[],
  pairingId: string,
  matchResult: import('./types.js').TournamentMatchRecord
): boolean {
  const pairing = findPairing(rounds, pairingId);
  if (!pairing) return false;
  if (pairing.status !== 'in_progress') return false;

  pairing.status = 'completed';
  pairing.matchResult = matchResult;
  pairing.completedAt = new Date().toISOString();
  return true;
}

/**
 * Generate deterministic pairing ID
 */
export function generatePairingId(participantA: string, participantB: string | null, roundNumber: number): string {
  const a = participantA.replace(/[^a-zA-Z0-9]/g, '');
  const b = participantB ? participantB.replace(/[^a-zA-Z0-9]/g, '') : 'bye';
  return `${a}-v-${b}-r${roundNumber}`;
}