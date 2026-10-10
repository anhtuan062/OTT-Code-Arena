/**
 * Server - Rate Limit Repository
 *
 * SQLite-backed rate limiting for login and registration attempts.
 * Uses a sliding-window approach keyed by username (or IP as fallback).
 */

import type { DatabaseWrapper } from '../db.js';

export interface RateLimitRecord {
  key: string;
  attempts: number;
  window_start: string;
  locked_until: string | null;
}

export interface RateLimitRepository {
  recordAttempt(key: string, maxAttempts: number, lockoutMs: number): { allowed: boolean; remaining: number; lockedUntil: string | null };
  check(key: string, maxAttempts: number, lockoutMs: number): { allowed: boolean; remaining: number; lockedUntil: string | null };
  reset(key: string): void;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minute window
const RETENTION_MS = 24 * 60 * 60 * 1000;

export class SqlRateLimitRepository implements RateLimitRepository {
  constructor(private readonly db: DatabaseWrapper) {}

  check(
    key: string,
    maxAttempts: number,
    lockoutMs: number
  ): { allowed: boolean; remaining: number; lockedUntil: string | null } {
    const now = new Date();
    this.prune(now);
    const row = this.db
      .prepare(
        `SELECT key, attempts, window_start, locked_until FROM rate_limits WHERE key = ?`
      )
      .get(key) as RateLimitRow | undefined;

    if (!row) {
      return { allowed: true, remaining: maxAttempts, lockedUntil: null };
    }

    // Reset window if it has expired
    const windowStart = new Date(row.window_start);
    if (now.getTime() - windowStart.getTime() > WINDOW_MS) {
      this.db
        .prepare(
          `UPDATE rate_limits SET attempts = 0, window_start = ?, locked_until = NULL WHERE key = ?`
        )
        .run(now.toISOString(), key);
      return { allowed: true, remaining: maxAttempts, lockedUntil: null };
    }

    // Check lockout
    if (row.locked_until && new Date(row.locked_until).getTime() > now.getTime()) {
      return { allowed: false, remaining: 0, lockedUntil: row.locked_until };
    }

    const remaining = Math.max(0, maxAttempts - row.attempts);
    return { allowed: remaining > 0, remaining, lockedUntil: row.locked_until };
  }

  recordAttempt(
    key: string,
    maxAttempts: number,
    lockoutMs: number
  ): { allowed: boolean; remaining: number; lockedUntil: string | null } {
    const now = new Date();
    this.prune(now);
    const existing = this.db
      .prepare(
        `SELECT key, attempts, window_start, locked_until FROM rate_limits WHERE key = ?`
      )
      .get(key) as RateLimitRow | undefined;

    if (!existing) {
      const lockedUntil =
        maxAttempts <= 1 ? new Date(now.getTime() + lockoutMs).toISOString() : null;
      this.db
        .prepare(
          `INSERT INTO rate_limits (key, attempts, window_start, locked_until) VALUES (?, 1, ?, ?)`
        )
        .run(key, now.toISOString(), lockedUntil);
      return { allowed: maxAttempts > 1, remaining: maxAttempts - 1, lockedUntil };
    }

    // Reset window if expired
    const windowStart = new Date(existing.window_start);
    let attempts = existing.attempts;
    let windowStartIso = existing.window_start;
    let lockedUntil = existing.locked_until;

    if (now.getTime() - windowStart.getTime() > WINDOW_MS) {
      attempts = 0;
      windowStartIso = now.toISOString();
      lockedUntil = null;
    }

    attempts += 1;
    const remaining = Math.max(0, maxAttempts - attempts);
    const allowed = remaining > 0;

    if (!allowed && !lockedUntil) {
      lockedUntil = new Date(now.getTime() + lockoutMs).toISOString();
    }

    this.db
      .prepare(
        `UPDATE rate_limits SET attempts = ?, window_start = ?, locked_until = ? WHERE key = ?`
      )
      .run(attempts, windowStartIso, lockedUntil, key);

    return { allowed, remaining, lockedUntil };
  }

  reset(key: string): void {
    this.db.prepare(`DELETE FROM rate_limits WHERE key = ?`).run(key);
  }

  private prune(now: Date): void {
    const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
    this.db.prepare(
      `DELETE FROM rate_limits
       WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)`
    ).run(cutoff, now.toISOString());
  }
}

interface RateLimitRow {
  key: string;
  attempts: number;
  window_start: string;
  locked_until: string | null;
}