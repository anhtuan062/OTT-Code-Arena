/**
 * Server - User Repository
 *
 * SQLite-backed persistence for user accounts.
 * All methods are synchronous (better-sqlite3) and safe under the
 * single-connection-per-process model enforced by DatabaseWrapper.
 */

import { randomUUID } from 'crypto';
import type { DatabaseWrapper } from '../db.js';

export type UserRole = 'competitor' | 'organizer';

export function isUserRole(value: unknown): value is UserRole {
  return value === 'competitor' || value === 'organizer';
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
  role: UserRole;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserRepository {
  create(input: CreateUserInput): User;
  findByUsername(username: string): User | null;
  findById(id: string): User | null;
  listAll(): User[];
  setLastLogin(id: string): void;
  exists(username: string): boolean;
}

export class SqlUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseWrapper) {}

  create(input: CreateUserInput): User {
    if (input.role !== undefined && !isUserRole(input.role)) throw new Error('Invalid user role');
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, input.username, input.passwordHash, now, input.role ?? 'competitor');
    return {
      id,
      username: input.username,
      password_hash: input.passwordHash,
      created_at: now,
      last_login_at: null,
      role: input.role ?? 'competitor',
    };
  }

  findByUsername(username: string): User | null {
    const row = this.db
      .prepare(
        'SELECT id, username, password_hash, created_at, last_login_at, role FROM users WHERE username = ?'
      )
      .get(username) as UserRow | undefined;
    if (!row) return null;
    try { return this.map(row); } catch { return null; }
  }

  findById(id: string): User | null {
    const row = this.db
      .prepare(
        'SELECT id, username, password_hash, created_at, last_login_at, role FROM users WHERE id = ?'
      )
      .get(id) as UserRow | undefined;
    if (!row) return null;
    try { return this.map(row); } catch { return null; }
  }

  listAll(): User[] {
    const rows = this.db
      .prepare('SELECT id, username, password_hash, created_at, last_login_at, role FROM users ORDER BY created_at, id')
      .all() as UserRow[];
    return rows.map(row => this.map(row));
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
    if (!isUserRole(row.role)) throw new Error(`Invalid persisted user role for ${row.id}`);
    return {
      id: row.id,
      username: row.username,
      password_hash: row.password_hash,
      created_at: row.created_at,
      last_login_at: row.last_login_at ?? null,
      role: row.role,
    };
  }
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
  role: unknown;
}
