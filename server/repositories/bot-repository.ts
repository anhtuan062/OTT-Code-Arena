/**
 * Server - Bot Repository
 *
 * SQLite-backed persistence for registered bots.
 * Bots are owned by a user (owner_id) or by the system user (public seed bots).
 * Credentials and secrets are never stored in bot metadata.
 */

import { randomUUID } from 'crypto';
import type { DatabaseWrapper } from '../db.js';

export interface BotRecord {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string> | null;
  owner_id: string | null;
  is_public: number;
  registered_at: string;
  current_revision_id: string | null;
}

export interface CreateBotInput {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  ownerId: string;
  isPublic?: boolean;
}

export interface BotRepository {
  create(input: CreateBotInput): BotRecord;
  findById(id: string): BotRecord | null;
  listByOwner(ownerId: string): BotRecord[];
  listPublic(): BotRecord[];
  listAll(): BotRecord[];
  update(id: string, ownerId: string, updates: Partial<Pick<CreateBotInput, 'name' | 'command' | 'args' | 'env' | 'isPublic'>>): BotRecord | null;
  delete(id: string, ownerId: string): boolean;
  exists(id: string): boolean;
}

export class SqlBotRepository implements BotRepository {
  constructor(private readonly db: DatabaseWrapper) {}

  create(input: CreateBotInput): BotRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bots (id, name, command, args, env, owner_id, is_public, registered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.command,
        JSON.stringify(input.args),
        input.env ? JSON.stringify(input.env) : null,
        input.ownerId,
        input.isPublic ? 1 : 0,
        now
      );
    return {
      id,
      name: input.name,
      command: input.command,
      args: input.args,
      env: input.env ?? null,
      owner_id: input.ownerId,
      is_public: input.isPublic ? 1 : 0,
      registered_at: now,
      current_revision_id: null,
    };
  }

  findById(id: string): BotRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, name, command, args, env, owner_id, is_public, registered_at
                , current_revision_id
         FROM bots WHERE id = ?`
      )
      .get(id) as BotRow | undefined;
    return row ? this.map(row) : null;
  }

  listByOwner(ownerId: string): BotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, command, args, env, owner_id, is_public, registered_at, current_revision_id
         FROM bots WHERE owner_id = ? ORDER BY registered_at DESC`
      )
      .all(ownerId) as BotRow[];
    return rows.map(r => this.map(r));
  }

  listPublic(): BotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, command, args, env, owner_id, is_public, registered_at, current_revision_id
         FROM bots WHERE is_public = 1 ORDER BY registered_at DESC`
      )
      .all() as BotRow[];
    return rows.map(r => this.map(r));
  }

  listAll(): BotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, command, args, env, owner_id, is_public, registered_at, current_revision_id
         FROM bots ORDER BY registered_at DESC`
      )
      .all() as BotRow[];
    return rows.map(r => this.map(r));
  }

  update(
    id: string,
    ownerId: string,
    updates: Partial<Pick<CreateBotInput, 'name' | 'command' | 'args' | 'env' | 'isPublic'>>
  ): BotRecord | null {
    const existing = this.findById(id);
    if (!existing || existing.owner_id !== ownerId) return null;

    const name = updates.name ?? existing.name;
    const command = updates.command ?? existing.command;
    const args = updates.args ?? existing.args;
    const env = updates.env !== undefined ? (updates.env ? JSON.stringify(updates.env) : null) : existing.env;
    const isPublic = updates.isPublic !== undefined ? (updates.isPublic ? 1 : 0) : existing.is_public;

    this.db
      .prepare(
        `UPDATE bots SET name = ?, command = ?, args = ?, env = ?, is_public = ? WHERE id = ? AND owner_id = ?`
      )
      .run(name, command, JSON.stringify(args), env, isPublic, id, ownerId);

    return this.findById(id);
  }

  delete(id: string, ownerId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM bots WHERE id = ? AND owner_id = ?`)
      .run(id, ownerId);
    return result.changes > 0;
  }

  exists(id: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM bots WHERE id = ?`).get(id);
    return !!row;
  }

  private map(row: BotRow): BotRecord {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      args: row.args ? JSON.parse(row.args) : [],
      env: row.env ? JSON.parse(row.env) : null,
      owner_id: row.owner_id,
      is_public: row.is_public,
      registered_at: row.registered_at,
      current_revision_id: row.current_revision_id ?? null,
    };
  }
}

interface BotRow {
  id: string;
  name: string;
  command: string;
  args: string;
  env: string | null;
  owner_id: string | null;
  is_public: number;
  registered_at: string;
  current_revision_id: string | null;
}
