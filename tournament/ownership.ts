/**
 * Cross-process ownership for a tournament storage directory.
 *
 * Ownership is represented by a long-lived SQLite write transaction. SQLite
 * releases the transaction if the owning process exits, so recovery does not
 * require deleting a possibly-live lock file or guessing whether a PID was
 * reused.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { hostname } from 'os';
import { randomUUID } from 'crypto';

export class StorageOwnershipError extends Error {
  constructor(public readonly directory: string, cause?: unknown) {
    super(`Tournament storage is already owned by another writer: ${directory}`);
    this.name = 'StorageOwnershipError';
    if (cause !== undefined) this.cause = cause;
  }
}

export class StorageOwnership {
  private readonly token = randomUUID();
  private db: Database.Database | undefined;
  private directory: string;

  constructor(directory: string) {
    this.directory = path.resolve(directory);
  }

  get canonicalDirectory(): string {
    return this.directory;
  }

  async acquire(): Promise<void> {
    if (this.db) return;

    await fs.mkdir(this.directory, { recursive: true });
    this.directory = await fs.realpath(this.directory);
    const databasePath = path.join(this.directory, '.tournament-owner.sqlite');
    let db: Database.Database | undefined;
    try {
      db = new Database(databasePath, { timeout: 0 });
      db.pragma('journal_mode = DELETE');
      db.pragma('synchronous = FULL');
      db.exec(`
        CREATE TABLE IF NOT EXISTS owner_metadata (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          token TEXT NOT NULL,
          pid INTEGER NOT NULL,
          host TEXT NOT NULL,
          acquired_at TEXT NOT NULL
        )
      `);

      // BEGIN IMMEDIATE is the ownership boundary. Keep this transaction open
      // until release(), including while filesystem persistence is in flight.
      db.exec('BEGIN IMMEDIATE');
      db.prepare('DELETE FROM owner_metadata').run();
      db.prepare(
        'INSERT INTO owner_metadata (singleton, token, pid, host, acquired_at) VALUES (1, ?, ?, ?, ?)'
      ).run(this.token, process.pid, hostname(), new Date().toISOString());
      this.db = db;
    } catch (error) {
      if (db) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        try { db.close(); } catch { /* preserve the ownership error */ }
      }
      if (this.isBusyError(error)) throw new StorageOwnershipError(this.directory, error);
      throw error;
    }
  }

  release(): void {
    const db = this.db;
    this.db = undefined;
    if (!db) return;
    try { db.exec('ROLLBACK'); } finally { db.close(); }
  }

  /**
   * Confirm that this connection still owns the uncommitted ownership row.
   * This deliberately uses the same connection: the row is not visible to
   * other connections while the ownership transaction is active.
   */
  assertHeld(): void {
    const db = this.db;
    if (!db) throw new Error(`Tournament storage ownership is not held: ${this.directory}`);
    try {
      const row = db.prepare('SELECT token FROM owner_metadata WHERE singleton = 1').get() as
        | { token: string }
        | undefined;
      if (!row || row.token !== this.token) {
        throw new Error(`Tournament storage ownership was lost: ${this.directory}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Tournament storage ownership')) throw error;
      throw new Error(`Tournament storage ownership connection is unusable: ${this.directory}`, { cause: error });
    }
  }

  private isBusyError(error: unknown): boolean {
    return error instanceof Error && /database is locked|database table is locked|busy/i.test(error.message);
  }
}
