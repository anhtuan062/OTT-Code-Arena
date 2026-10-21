/**
 * Server - Session Repository
 *
 * SQLite-backed session store. Sessions are keyed by a random sid and
 * reference a user id. The session token is never stored in the DB;
 * only the token hash is persisted so that session invalidation is
 * possible without leaking the raw cookie value.
 */

import { randomUUID, createHash } from 'crypto';
import type { DatabaseWrapper } from '../db.js';
import { applicationMetrics } from '../../observability/metrics.js';

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token: string;
  created_at: string;
  expires_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
}

export interface CreateSessionInput {
  userId: string;
  token: string;
  csrfToken: string;
  userAgent?: string | null;
  ip?: string | null;
  ttlMs?: number;
}

export interface SessionRepository {
  create(input: CreateSessionInput): SessionRecord;
  findByToken(token: string): SessionRecord | null;
  deleteByToken(token: string): void;
  deleteAllForUser(userId: string): number;
  deleteExpired(now?: string): number;
  touch(id: string): void;
  touchIfDue(session: SessionRecord, now?: Date, minIntervalMs?: number): boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export class SqlSessionRepository implements SessionRepository {
  constructor(
    private readonly db: DatabaseWrapper,
    private readonly ttlMs: number = DEFAULT_TTL_MS
  ) {}

  create(input: CreateSessionInput): SessionRecord {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.ttlMs ?? this.ttlMs));
    const record: SessionRecord = {
      id,
      user_id: input.userId,
      token_hash: createHash('sha256').update(input.token).digest('hex'),
      csrf_token: input.csrfToken,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      last_active_at: now.toISOString(),
      user_agent: input.userAgent ?? null,
      ip: input.ip ?? null,
    };

    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, expires_at, last_active_at, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.user_id,
        record.token_hash,
        record.csrf_token,
        record.created_at,
        record.expires_at,
        record.last_active_at,
        record.user_agent,
        record.ip
      );

    return record;
  }

  findByToken(token: string): SessionRecord | null {
    const hash = createHash('sha256').update(token).digest('hex');
    const row = this.db
      .prepare(
        `SELECT id, user_id, token_hash, csrf_token, created_at, expires_at, last_active_at, user_agent, ip
         FROM sessions WHERE token_hash = ?`
      )
      .get(hash) as SessionRow | undefined;
    return row ? this.map(row) : null;
  }

  deleteByToken(token: string): void {
    const hash = createHash('sha256').update(token).digest('hex');
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hash);
  }

  deleteAllForUser(userId: string): number {
    const result = this.db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    return result.changes;
  }

  deleteExpired(now: string = new Date().toISOString()): number {
    const result = this.db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now);
    return result.changes;
  }

  touch(id: string): void {
    this.db
      .prepare(`UPDATE sessions SET last_active_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  touchIfDue(
    session: SessionRecord,
    now = new Date(),
    minIntervalMs = DEFAULT_SESSION_TOUCH_INTERVAL_MS,
  ): boolean {
    const nowMs = now.getTime();
    const lastActiveMs = Date.parse(session.last_active_at);
    const expiresMs = Date.parse(session.expires_at);
    const intervalMs = Math.max(0, minIntervalMs);
    const due = !Number.isFinite(lastActiveMs)
      || !Number.isFinite(expiresMs)
      || nowMs - lastActiveMs >= intervalMs
      || expiresMs - nowMs <= intervalMs;

    if (!due) {
      applicationMetrics.increment('session.touch_skips');
      return false;
    }

    // Preserve the session's persisted sliding window, including sessions
    // created with a custom TTL, instead of relying on process-local state.
    const persistedTtlMs = Number.isFinite(lastActiveMs) && Number.isFinite(expiresMs)
      ? expiresMs - lastActiveMs
      : this.ttlMs;
    const nextExpiresAt = new Date(nowMs + Math.max(1, persistedTtlMs || this.ttlMs)).toISOString();
    const result = this.db
      .prepare(
        `UPDATE sessions
         SET last_active_at = ?, expires_at = ?
         WHERE id = ? AND last_active_at = ? AND expires_at > ?`
      )
      .run(now.toISOString(), nextExpiresAt, session.id, session.last_active_at, now.toISOString());

    if (result.changes === 1) applicationMetrics.increment('session.touch_updates');
    else applicationMetrics.increment('session.touch_skips');
    return result.changes === 1;
  }

  private map(row: SessionRow): SessionRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      csrf_token: row.csrf_token,
      created_at: row.created_at,
      expires_at: row.expires_at,
      last_active_at: row.last_active_at,
      user_agent: row.user_agent,
      ip: row.ip,
    };
  }
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token: string;
  created_at: string;
  expires_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
}
