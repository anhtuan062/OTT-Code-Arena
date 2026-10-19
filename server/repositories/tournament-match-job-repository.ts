import type { DatabaseWrapper } from '../db.js';
import type { MatchJobClaim, MatchJobRecord, MatchJobStore } from '../../tournament/match-job-store.js';
import type { TournamentPairing } from '../../tournament/types.js';

function matchId(tournamentId: string, pairingId: string): string {
  const value = `${tournamentId}-${pairingId}`;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : `m-${Buffer.from(value).toString('base64url').slice(0, 120)}`;
}

function now(): string { return new Date().toISOString(); }

function mapRow(row: any): MatchJobRecord {
  return {
    jobId: row.job_id,
    tournamentId: row.tournament_id,
    pairingId: row.pairing_id,
    matchId: row.match_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attemptCount: row.attempt_count,
    leaseOwner: row.lease_owner,
    fencingToken: row.fencing_token,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export class SqlTournamentMatchJobRepository implements MatchJobStore {
  constructor(private readonly db: DatabaseWrapper) {}

  ensureForTournament(tournamentId: string, pairings: TournamentPairing[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO tournament_match_jobs
        (job_id, tournament_id, pairing_id, match_id, idempotency_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
    `);
    const timestamp = now();
    const apply = this.db.transaction(() => {
      for (const pairing of pairings) {
        if (pairing.participantB === null) continue;
        const id = matchId(tournamentId, pairing.pairingId);
        insert.run(`${tournamentId}:${pairing.pairingId}`, tournamentId, pairing.pairingId, id, `${tournamentId}:${pairing.pairingId}:${id}`, timestamp, timestamp);
      }
    });
    apply();
  }

  reconcile(tournamentId: string, pairings: TournamentPairing[], committedPairingIds: Iterable<string> = []): void {
    const committed = new Set(committedPairingIds);
    const upsert = this.db.prepare(`
      INSERT OR IGNORE INTO tournament_match_jobs
        (job_id, tournament_id, pairing_id, match_id, idempotency_key, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
    `);
    const update = this.db.prepare(`
      UPDATE tournament_match_jobs SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = NULL, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END,
        updated_at = ? WHERE tournament_id = ? AND pairing_id = ?
    `);
    const timestamp = now();
    const apply = this.db.transaction(() => {
      const seen = new Set<string>();
      for (const pairing of pairings) {
        if (pairing.participantB === null) continue;
        seen.add(pairing.pairingId);
        const id = matchId(tournamentId, pairing.pairingId);
        upsert.run(`${tournamentId}:${pairing.pairingId}`, tournamentId, pairing.pairingId, id, `${tournamentId}:${pairing.pairingId}:${id}`, timestamp, timestamp);
        const completed = committed.has(pairing.pairingId) || pairing.status === 'completed' || pairing.status === 'pending_tiebreaker';
        const next = completed ? 'completed' : 'queued';
        update.run(next, next, timestamp, timestamp, tournamentId, pairing.pairingId);
      }
      this.db.prepare(`UPDATE tournament_match_jobs SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE tournament_id = ? AND pairing_id NOT IN (${seen.size ? [...seen].map(() => '?').join(',') : "''"}) AND status <> 'completed'`)
        .run(timestamp, tournamentId, ...seen);
    });
    apply();
  }

  claim(tournamentId: string, pairingId: string, leaseOwner: string, leaseMs: number): MatchJobClaim | null {
    const timestamp = now();
    const expires = new Date(Date.now() + Math.max(1, leaseMs)).toISOString();
    const transaction = this.db.transaction(() => {
      const raw = this.db.prepare(`SELECT * FROM tournament_match_jobs WHERE tournament_id = ? AND pairing_id = ?`).get(tournamentId, pairingId) as any;
      const row = raw ? mapRow(raw) : undefined;
      if (!row || row.status === 'completed') return null;
      if (row.status === 'running' && row.leaseExpiresAt && row.leaseExpiresAt > timestamp) return null;
      const result = this.db.prepare(`UPDATE tournament_match_jobs SET status='running', lease_owner=?, lease_expires_at=?, attempt_count=attempt_count+1, fencing_token=fencing_token+1, started_at=COALESCE(started_at, ?), updated_at=? WHERE job_id=? AND (status='queued' OR (status='running' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)))`).run(leaseOwner, expires, timestamp, timestamp, row.jobId, timestamp);
      if (!result.changes) return null;
      const claimed = mapRow(this.db.prepare(`SELECT * FROM tournament_match_jobs WHERE job_id=?`).get(row.jobId));
      return { jobId: claimed.jobId, tournamentId, pairingId, matchId: claimed.matchId, idempotencyKey: claimed.idempotencyKey, attemptCount: claimed.attemptCount, leaseOwner, fencingToken: claimed.fencingToken };
    });
    return transaction();
  }

  renew(claim: MatchJobClaim, leaseMs: number): boolean {
    const result = this.db.prepare(`UPDATE tournament_match_jobs SET lease_expires_at=?, updated_at=? WHERE job_id=? AND status='running' AND lease_owner=? AND fencing_token=?`).run(new Date(Date.now() + Math.max(1, leaseMs)).toISOString(), now(), claim.jobId, claim.leaseOwner, claim.fencingToken);
    return result.changes === 1;
  }

  assertLease(claim: MatchJobClaim): boolean {
    const row = this.db.prepare(`SELECT 1 FROM tournament_match_jobs WHERE job_id=? AND status='running' AND lease_owner=? AND fencing_token=? AND lease_expires_at > ?`).get(claim.jobId, claim.leaseOwner, claim.fencingToken, now());
    return Boolean(row);
  }

  complete(claim: MatchJobClaim): boolean { return this.finish(claim, 'completed'); }

  release(claim: MatchJobClaim, error?: unknown): boolean {
    const result = this.db.prepare(`UPDATE tournament_match_jobs SET status='queued', lease_owner=NULL, lease_expires_at=NULL, last_error=?, updated_at=? WHERE job_id=? AND status='running' AND lease_owner=? AND fencing_token=?`).run(error instanceof Error ? error.message.slice(0, 500) : error ? String(error).slice(0, 500) : null, now(), claim.jobId, claim.leaseOwner, claim.fencingToken);
    return result.changes === 1;
  }

  private finish(claim: MatchJobClaim, status: 'completed'): boolean {
    const timestamp = now();
    const result = this.db.prepare(`UPDATE tournament_match_jobs SET status=?, lease_owner=NULL, lease_expires_at=NULL, completed_at=?, updated_at=? WHERE job_id=? AND status='running' AND lease_owner=? AND fencing_token=?`).run(status, timestamp, timestamp, claim.jobId, claim.leaseOwner, claim.fencingToken);
    return result.changes === 1;
  }

  get(tournamentId: string, pairingId: string): MatchJobRecord | null {
    const row = this.db.prepare(`SELECT * FROM tournament_match_jobs WHERE tournament_id=? AND pairing_id=?`).get(tournamentId, pairingId) as any;
    return row ? mapRow(row) : null;
  }
}
