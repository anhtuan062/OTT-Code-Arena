/**
 * Server - User Repository
 *
 * SQLite-backed persistence for user accounts.
 * All methods are synchronous (better-sqlite3) and safe under the
 * single-connection-per-process model enforced by DatabaseWrapper.
 */

import { randomUUID } from 'crypto';
import type { DatabaseWrapper } from '../db.js';

export interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
}

export interface UserRepository {
  create(input: CreateUserInput): User;
  findByUsername(username: string): User | null;
  findById(id: string): User | null;
  setLastLogin(id: string): void;
  exists(username: string): boolean;
}

export class SqlUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseWrapper) {}

  create(input: CreateUserInput): User {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, input.username, input.passwordHash, now);
    return {
      id,
      username: input.username,
      password_hash: input.passwordHash,
      created_at: now,
      last_login_at: null,
    };
  }

  findByUsername(username: string): User | null {
    const row = this.db
      .prepare(
        'SELECT id, username, password_hash, created_at, last_login_at FROM users WHERE username = ?'
      )
      .get(username) as UserRow | undefined;
    return row ? this.map(row) : null;
  }

  findById(id: string): User | null {
    const row = this.db
      .prepare(
        'SELECT id, username, password_hash, created_at, last_login_at FROM users WHERE id = ?'
      )
      .get(id) as UserRow | undefined;
    return row ? this.map(row) : null;
  }

  setLastLogin(id: string): void {
    this.db
      .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  exists(username: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    return !!row;
  }

  private map(row: UserRow): User {
    return {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      created_at: row.created_at,
      last_login_at: row.last_login_at ?? null,
    };
  }
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
}