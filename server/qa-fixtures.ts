import type {
  Tournament,
  TournamentPairing,
} from '../tournament/types.js';

export function isQaFixturesEnabled(): boolean {
  return (
    process.env.ENABLE_QA_FIXTURES === 'true' ||
    process.env.QA_FIXTURES === 'true'
  );
}

// In-memory registry of fixtures to allow interactive tiebreaker resolution and retry without touching production
let fixtureRegistry: Map<string, Tournament> | null = null;

function getRegistry(): Map<string, Tournament> {
  if (!fixtureRegistry) {
    fixtureRegistry = new Map<string, Tournament>();
  }
  return fixtureRegistry;
}

export function resetQaFixtures(): void {
  fixtureRegistry = null;
}

export function listQaFixtures(): Tournament[] {
  return Array.from(getRegistry().values());
}

export function getQaFixture(tournamentId: string): Tournament | undefined {
  return getRegistry().get(tournamentId);
}

/** QA fixtures are isolated test data, never a shared public namespace. */
export function getOwnedQaFixture(tournamentId: string, ownerId: string): Tournament | undefined {
  const fixture = getQaFixture(tournamentId);
  return fixture?.metadata?.ownerId === ownerId ? fixture : undefined;
}

export function listOwnedQaFixtures(ownerId: string): Tournament[] {
  return listQaFixtures().filter(fixture => fixture.metadata?.ownerId === ownerId);
}

/** Test harness hook; callers must provide an explicit organizer owner. */
export function registerQaFixture(fixture: Tournament): void {
  const ownerId = fixture.metadata?.ownerId;
  if (typeof ownerId !== 'string' || !ownerId) throw new Error('QA fixture requires an organizer ownerId');
  getRegistry().set(fixture.tournamentId, fixture);
}

export function resolveQaFixtureTiebreaker(
  tournamentIdOrPairingId: string,
  pairingIdOrWinner: string,
  winnerOrReason?: string,
  reasonOrResolvedBy?: string,
  resolvedBy?: string,
): { success: boolean; data?: Tournament; pairing?: TournamentPairing; error?: string } {
  let tournamentId: string | undefined;
  let pairingId: string;
  let winner: 'A' | 'B';
  let reason: string | undefined;
  let byUser: string | undefined;

  if (winnerOrReason === 'A' || winnerOrReason === 'B') {
    // Called with (tournamentId, pairingId, winner, reason, resolvedBy)
    tournamentId = tournamentIdOrPairingId;
    pairingId = pairingIdOrWinner;
    winner = winnerOrReason;
    reason = reasonOrResolvedBy;
    byUser = resolvedBy;
  } else {
    // Called with (pairingId, winner, reason)
    pairingId = tournamentIdOrPairingId;
    winner = pairingIdOrWinner as 'A' | 'B';
    reason = winnerOrReason;
  }

  const registry = getRegistry();
  const tournaments = tournamentId ? [registry.get(tournamentId)].filter(Boolean) as Tournament[] : Array.from(registry.values());

  for (const tournament of tournaments) {
    const rounds = [
      ...(tournament.rounds ?? []),
      ...(tournament.stages ?? []).flatMap(stage => stage.rounds ?? []),
    ];
    for (const round of rounds) {
      const pairing = round.pairings.find(p => p.pairingId === pairingId);
      if (pairing) {
          pairing.status = 'completed';
          pairing.tiebreakerStatus = 'resolved';
          pairing.tiebreakerResolution = {
            winner,
            resolvedBy: byUser || 'e856aa5e-0a4b-4f80-993d-418da91c00d5',
            resolvedAt: new Date().toISOString(),
            reason: reason || 'Resolved by organizer',
          };
          const winnerId = winner === 'A' ? pairing.participantA : pairing.participantB;
          pairing.matchResult = {
            winner,
            terminationReason: 'goal_reached',
            matchId: pairing.matchId || `qa-tb-${pairingId}`,
            pairingId,
            participantA: pairing.participantA || '',
            participantB: pairing.participantB || '',
            turnCount: 24,
            durationMs: 1500,
            replayRef: `replay-tb-${pairingId}`,
            completedAt: new Date().toISOString(),
            series: {
              format: 'bo3',
              bestOf: 3,
              winsA: winner === 'A' ? 2 : 1,
              winsB: winner === 'B' ? 2 : 1,
              winner,
              seed: 'resolved',
              games: [],
            },
          };

          // Advance into dependent slots in subsequent rounds
          for (const nextRound of (tournament.stages ?? []).flatMap(stage => stage.rounds ?? [])) {
            for (const nextPairing of nextRound.pairings) {
              if (nextPairing.slotA?.sourceRef?.pairingId === pairingId) {
                nextPairing.slotA.participantId = winnerId;
                nextPairing.participantA = winnerId!;
              }
              if (nextPairing.slotB?.sourceRef?.pairingId === pairingId) {
                nextPairing.slotB.participantId = winnerId;
                nextPairing.participantB = winnerId!;
              }
            }
          }
          return { success: true, data: tournament, pairing };
      }
    }
  }
  return { success: false, error: `Pairing ${pairingId} not found in fixtures` };
}

export function retryQaFixturePairing(
  tournamentId: string,
  pairingId: string,
): { success: boolean; pairing?: TournamentPairing; error?: string } {
  const tournament = getRegistry().get(tournamentId);
  if (!tournament) return { success: false, error: 'Tournament not found' };

  const rounds = [
    ...(tournament.rounds ?? []),
    ...(tournament.stages ?? []).flatMap(stage => stage.rounds ?? []),
  ];
  for (const round of rounds) {
    const pairing = round.pairings.find(p => p.pairingId === pairingId);
    if (pairing) {
      pairing.status = 'scheduled';
      pairing.failureReason = null;
      pairing.failureCode = null;
      return { success: true, pairing };
    }
  }
  return { success: false, error: 'Pairing not found' };
}
