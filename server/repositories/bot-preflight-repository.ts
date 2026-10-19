import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../db.js';

export type BotPreflightStatus = 'pending' | 'passed' | 'failed' | 'expired';

export interface BotPreflightKey {
  revisionId: string;
  sourceDigest: string;
  runtimeId: string;
  executionMode: string;
  sdkVersion?: string;
  sdkDigest?: string;
  protocolVersion: string;
  checkerVersion: string;
  environmentKey: string;
}

export interface BotPreflightRecord extends BotPreflightKey {
  validationId: string;
  status: BotPreflightStatus;
  errorCode: string | null;
  diagnostic: Record<string, unknown> | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
}

interface Row {
  validation_id: string;
  revision_id: string;
  source_digest: string;
  runtime_id: string;
  execution_mode: string;
  sdk_version: string | null;
  sdk_digest: string | null;
  protocol_version: string;
  checker_version: string;
  environment_key: string;
  status: BotPreflightStatus;
  error_code: string | null;
  diagnostic_json: string | null;
  requested_at: string;
  completed_at: string | null;
  expires_at: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
}

export class SqlBotPreflightRepository {
  constructor(private readonly db: DatabaseWrapper) {}

  find(key: BotPreflightKey): BotPreflightRecord | null {
    const row = this.db.prepare(`SELECT * FROM bot_preflight_validations
      WHERE revision_id = ? AND source_digest = ? AND runtime_id = ? AND execution_mode = ?
        AND sdk_version = ? AND sdk_digest = ? AND protocol_version = ?
        AND checker_version = ? AND environment_key = ?`).get(
      key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode,
      key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion,
      key.checkerVersion, key.environmentKey,
    ) as Row | undefined;
    return row ? this.map(row) : null;
  }

  listPending(): BotPreflightRecord[] {
    const rows = this.db.prepare(`SELECT * FROM bot_preflight_validations WHERE status = 'pending' ORDER BY requested_at ASC`).all() as Row[];
    return rows.map(row => this.map(row));
  }

  start(key: BotPreflightKey): BotPreflightRecord {
    const now = new Date().toISOString();
    const validationId = `preflight-${randomUUID()}`;
    this.db.prepare(`INSERT INTO bot_preflight_validations
      (validation_id, revision_id, source_digest, runtime_id, execution_mode, sdk_version, sdk_digest,
       protocol_version, checker_version, environment_key, status, requested_at, attempt_count, next_attempt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, NULL)
      ON CONFLICT(revision_id, source_digest, runtime_id, execution_mode, sdk_version, sdk_digest, protocol_version, checker_version, environment_key)
      DO UPDATE SET validation_id = excluded.validation_id, status = 'pending', error_code = NULL,
        diagnostic_json = NULL, requested_at = excluded.requested_at, completed_at = NULL, expires_at = NULL,
        attempt_count = 0, next_attempt_at = NULL`).run(
      validationId, key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode,
      key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion,
      key.checkerVersion, key.environmentKey, now,
    );
    return this.find(key)!;
  }

  finish(key: BotPreflightKey, status: Exclude<BotPreflightStatus, 'pending'>, errorCode: string | null, diagnostic: Record<string, unknown> | null, ttlMs: number): BotPreflightRecord {
    const completedAt = new Date().toISOString();
    const expiresAt = status === 'passed' ? new Date(Date.now() + ttlMs).toISOString() : null;
    this.db.prepare(`UPDATE bot_preflight_validations SET status = ?, error_code = ?, diagnostic_json = ?, completed_at = ?, expires_at = ?, next_attempt_at = NULL
      WHERE revision_id = ? AND source_digest = ? AND runtime_id = ? AND execution_mode = ?
        AND sdk_version = ? AND sdk_digest = ? AND protocol_version = ? AND checker_version = ? AND environment_key = ?`).run(
      status, errorCode, diagnostic ? JSON.stringify(diagnostic) : null, completedAt, expiresAt,
      key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode,
      key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion,
      key.checkerVersion, key.environmentKey,
    );
    return this.find(key)!;
  }

  expire(key: BotPreflightKey): BotPreflightRecord | null {
    this.db.prepare(`UPDATE bot_preflight_validations SET status = 'expired'
      WHERE revision_id = ? AND source_digest = ? AND runtime_id = ? AND execution_mode = ?
        AND sdk_version = ? AND sdk_digest = ? AND protocol_version = ? AND checker_version = ? AND environment_key = ?
        AND status = 'passed'`).run(key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode,
      key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion, key.checkerVersion, key.environmentKey);
    return this.find(key);
  }

  scheduleRetry(key: BotPreflightKey, errorCode: string, diagnostic: Record<string, unknown>, nextAttemptAt: string): BotPreflightRecord {
    this.db.prepare(`UPDATE bot_preflight_validations
      SET status = 'pending', error_code = ?, diagnostic_json = ?, completed_at = NULL,
          expires_at = NULL, attempt_count = attempt_count + 1, next_attempt_at = ?
      WHERE revision_id = ? AND source_digest = ? AND runtime_id = ? AND execution_mode = ?
        AND sdk_version = ? AND sdk_digest = ? AND protocol_version = ? AND checker_version = ? AND environment_key = ?`).run(
      errorCode, JSON.stringify(diagnostic), nextAttemptAt,
      key.revisionId, key.sourceDigest, key.runtimeId, key.executionMode,
      key.sdkVersion ?? '', key.sdkDigest ?? '', key.protocolVersion,
      key.checkerVersion, key.environmentKey,
    );
    return this.find(key)!;
  }

  private map(row: Row): BotPreflightRecord {
    return {
      validationId: row.validation_id, revisionId: row.revision_id, sourceDigest: row.source_digest,
      runtimeId: row.runtime_id, executionMode: row.execution_mode, sdkVersion: row.sdk_version || undefined,
      sdkDigest: row.sdk_digest || undefined, protocolVersion: row.protocol_version,
      checkerVersion: row.checker_version, environmentKey: row.environment_key, status: row.status,
      errorCode: row.error_code, diagnostic: row.diagnostic_json ? JSON.parse(row.diagnostic_json) : null,
      requestedAt: row.requested_at, completedAt: row.completed_at, expiresAt: row.expires_at,
      attemptCount: row.attempt_count ?? 0, nextAttemptAt: row.next_attempt_at ?? null,
    };
  }
}
