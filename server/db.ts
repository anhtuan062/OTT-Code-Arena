/**
 * Server - Database Layer
 *
 * SQLite persistence for users, bot registry, sessions, and rate-limit counters.
 * Uses a single connection per process with WAL mode and foreign-key enforcement.
 * Schema is applied idempotently via a versioned migration table.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

export const CURRENT_SCHEMA_VERSION = 5;

export interface DatabaseConfig {
  path: string;
  busyTimeoutMs?: number;
  readonly?: boolean;
}

export interface DatabaseLike {
  prepare(sql: string): any;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

let shared: DatabaseWrapper | null = null;

export class DatabaseWrapper {
  private db: Database.Database;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    const db = new Database(config.path, { readonly: config.readonly ?? false, fileMustExist: config.readonly ?? false });
    this.db = db;
    try {
      this.db.pragma(`busy_timeout = ${config.busyTimeoutMs ?? 5000}`);
      if (!config.readonly) this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      if (!config.readonly) this.db.pragma('synchronous = NORMAL');
    } catch (error) {
      db.close();
      throw error;
    }
  }

  prepare(sql: string): any {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn);
  }

  close() {
    this.db.close();
  }

  async backupTo(destinationPath: string): Promise<void> {
    await this.db.backup(destinationPath);
  }

  integrityCheck(): boolean {
    const row = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
    return row?.integrity_check === 'ok';
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL,
  env TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;

function getMigrations(): string[] {
  return [SCHEMA_SQL, `
    -- Some early v1 databases recorded the version before all base tables
    -- were created. Repair those tables before applying later migrations.
    CREATE TABLE IF NOT EXISTS bots (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      args TEXT NOT NULL,
      env TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      registered_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      user_agent TEXT,
      ip TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      window_start TEXT NOT NULL,
      locked_until TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    ALTER TABLE users
      ADD COLUMN role TEXT NOT NULL DEFAULT 'competitor'
      CHECK (role IN ('competitor', 'organizer'));`, `
    ALTER TABLE bots ADD COLUMN current_revision_id TEXT;
    CREATE TABLE IF NOT EXISTS bot_revisions (
      revision_id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      source_digest TEXT NOT NULL,
      storage_ref TEXT NOT NULL UNIQUE,
      runtime_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source_size INTEGER NOT NULL,
      label TEXT,
      FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bot_revisions_bot ON bot_revisions(bot_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bot_revisions_owner ON bot_revisions(owner_id);`, `
    ALTER TABLE bot_revisions ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'raw'
      CHECK (execution_mode IN ('raw', 'strategy'));
    ALTER TABLE bot_revisions ADD COLUMN sdk_version TEXT;
    ALTER TABLE bot_revisions ADD COLUMN sdk_digest TEXT;`, `
    CREATE TABLE IF NOT EXISTS spectator_entitlements (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      revoked_at TEXT,
      UNIQUE (tournament_id, viewer_id),
      FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_spectator_entitlements_tournament
      ON spectator_entitlements(tournament_id, revoked_at);
    CREATE INDEX IF NOT EXISTS idx_spectator_entitlements_viewer
      ON spectator_entitlements(viewer_id, revoked_at);`];
}

export async function initializeDatabase(config: DatabaseConfig): Promise<DatabaseWrapper> {
  const dir = path.dirname(config.path);
  await fs.mkdir(dir, { recursive: true });

  const wrapper = new DatabaseWrapper(config);

  // Ensure migration tracking table exists before version check
  wrapper.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  try {
    const row = wrapper.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schema_version').get() as { v: number };
    let current = row?.v ?? 0;

    const migrations = getMigrations();
    if (current > migrations.length) {
      throw new Error(`Unsupported database schema version ${current}; maximum supported version is ${migrations.length}`);
    }
    for (let i = current; i < migrations.length; i++) {
      const apply = wrapper.transaction(() => {
        wrapper.exec(migrations[i]!);
        wrapper.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(i + 1);
      });
      apply();
      current = i + 1;
    }
    return wrapper;
  } catch (error) {
    wrapper.close();
    throw error;
  }
}

export async function backupDatabase(source: DatabaseWrapper, destinationPath: string): Promise<void> {
  const destinationDir = path.dirname(destinationPath);
  await fs.mkdir(destinationDir, { recursive: true });
  try {
    await fs.access(destinationPath);
    throw new Error(`Backup destination already exists: ${destinationPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    await source.backupTo(destinationPath);
    const validation = new DatabaseWrapper({ path: destinationPath, readonly: true });
    try {
      if (!validation.integrityCheck()) throw new Error('Created database backup failed integrity check');
    } finally {
      validation.close();
    }
  } catch (error) {
    await fs.rm(destinationPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function restoreDatabase(backupPath: string, targetPath: string): Promise<string | null> {
    const backup = new DatabaseWrapper({ path: backupPath, readonly: true });
    try {
      if (!backup.integrityCheck()) throw new Error('Backup failed integrity check');
    } finally {
      backup.close();
    }

    const targetDir = path.dirname(targetPath);
    await fs.mkdir(targetDir, { recursive: true });
  const temporaryTarget = `${targetPath}.restore-${randomUUID()}.tmp`;
  try {
    await fs.copyFile(backupPath, temporaryTarget);
    const validation = new DatabaseWrapper({ path: temporaryTarget, readonly: true });
    try {
      if (!validation.integrityCheck()) throw new Error('Restore copy failed integrity check');
    } finally {
      validation.close();
    }

    let originalBackup: string | null = null;
    try {
      try {
        await fs.access(targetPath);
        originalBackup = `${targetPath}.pre-restore-${randomUUID()}.bak`;
        await fs.rename(targetPath, originalBackup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(temporaryTarget, targetPath);
      return originalBackup;
    } catch (error) {
      if (originalBackup) await fs.rename(originalBackup, targetPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    await fs.rm(temporaryTarget, { force: true }).catch(() => {});
    throw error;
  }
}

export function getSharedDatabase(): DatabaseWrapper {
  if (!shared) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return shared;
}

export function setSharedDatabase(wrapper: DatabaseWrapper): void {
  shared = wrapper;
}

export function closeSharedDatabase(): void {
  if (shared) {
    shared.close();
    shared = null;
  }
}

export function newId(): string {
  return randomUUID();
}
