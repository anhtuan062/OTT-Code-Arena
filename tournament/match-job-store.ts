import type { TournamentPairing } from './types.js';

export type MatchJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MatchJobClaim {
  jobId: string;
  tournamentId: string;
  pairingId: string;
  matchId: string;
  idempotencyKey: string;
  attemptCount: number;
  leaseOwner: string;
  fencingToken: number;
}

export interface MatchJobRecord extends MatchJobClaim {
  status: MatchJobStatus;
  leaseExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MatchJobStore {
  ensureForTournament(tournamentId: string, pairings: TournamentPairing[]): void | Promise<void>;
  reconcile(tournamentId: string, pairings: TournamentPairing[], committedPairingIds?: Iterable<string>): void | Promise<void>;
  claim(tournamentId: string, pairingId: string, leaseOwner: string, leaseMs: number): MatchJobClaim | null | Promise<MatchJobClaim | null>;
  renew(claim: MatchJobClaim, leaseMs: number): boolean | Promise<boolean>;
  assertLease(claim: MatchJobClaim): boolean | Promise<boolean>;
  complete(claim: MatchJobClaim): boolean | Promise<boolean>;
  release(claim: MatchJobClaim, error?: unknown): boolean | Promise<boolean>;
}
