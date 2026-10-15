import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseWrapper } from '../db.js';

export const SUPPORTED_SOURCE_RUNTIMES = ['cpp', 'python3'] as const;
export type SupportedSourceRuntime = typeof SUPPORTED_SOURCE_RUNTIMES[number];
export const LEGACY_SOURCE_RUNTIME = 'nodejs';
export const MAX_SOURCE_BYTES = 64 * 1024;

export interface BotRevisionRecord {
  revision_id: string;
  bot_id: string;
  owner_id: string;
  source_digest: string;
  storage_ref: string;
  runtime_id: string;
  created_at: string;
  source_size: number;
  label: string | null;
  selected: boolean;
  execution_mode: 'raw' | 'strategy';
  sdk_version: string | null;
  sdk_digest: string | null;
}

export interface CreateRevisionInput {
  botId: string;
  ownerId: string;
  source: string;
  runtimeId: string;
  label?: string;
  executionMode?: 'raw' | 'strategy';
  sdkVersion?: string;
  sdkDigest?: string;
}

interface RevisionRow extends Omit<BotRevisionRecord, 'selected'> {
  selected: number;
}

const ID_PATTERN = /^[0-9a-f-]{36}$/i;

export class SqlBotRevisionRepository {
  constructor(private readonly db: DatabaseWrapper, private readonly storageRoot: string) {}

  async create(input: CreateRevisionInput): Promise<BotRevisionRecord> {
    if (!isSupportedSourceRuntime(input.runtimeId)) throw new Error('Unsupported source runtime');
    if (!ID_PATTERN.test(input.botId)) throw new Error('Invalid bot identifier');
    if (typeof input.source !== 'string' || input.source.length === 0) throw new Error('Source is required');
    const sourceBytes = Buffer.from(input.source, 'utf8');
    if (new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes) !== input.source) throw new Error('Source must be valid UTF-8');
    if (sourceBytes.byteLength > MAX_SOURCE_BYTES) throw new Error('Source exceeds the maximum size');
    const label = input.label?.trim() || null;
    const executionMode = input.executionMode ?? 'raw';
    if (executionMode === 'strategy' && (!input.sdkVersion || !/^[a-z0-9._-]{1,64}$/i.test(input.sdkVersion) || !input.sdkDigest || !/^[a-f0-9]{64}$/.test(input.sdkDigest))) {
      throw new Error('Invalid strategy SDK identity');
    }
    if (executionMode !== 'raw' && executionMode !== 'strategy') throw new Error('Unsupported execution mode');
    if (label && label.length > 100) throw new Error('Revision label is too long');

    const bot = this.db.prepare('SELECT id, owner_id FROM bots WHERE id = ? AND owner_id = ?').get(input.botId, input.ownerId) as { id: string; owner_id: string } | undefined;
    if (!bot) throw new Error('Bot not found');

    const revisionId = randomUUID();
    const extension = input.runtimeId === 'cpp' ? 'cpp' : 'py';
    const storageRef = path.posix.join('bot-revisions', input.botId, `${revisionId}.${extension}`);
    const absolutePath = await this.preparePath(storageRef, true);
    const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
    const digest = createHash('sha256').update(sourceBytes).digest('hex');
    const createdAt = new Date().toISOString();
    let finalized = false;
    try {
      await writeFile(temporaryPath, sourceBytes, { flag: 'wx', mode: 0o600 });
      await rename(temporaryPath, absolutePath);
      finalized = true;
      this.db.prepare(`INSERT INTO bot_revisions
        (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, label, execution_mode, sdk_version, sdk_digest)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(revisionId, input.botId, input.ownerId, digest, storageRef, input.runtimeId, createdAt, sourceBytes.byteLength, label, executionMode, executionMode === 'strategy' ? input.sdkVersion : null, executionMode === 'strategy' ? input.sdkDigest : null);
      return { revision_id: revisionId, bot_id: input.botId, owner_id: input.ownerId, source_digest: digest, storage_ref: storageRef, runtime_id: input.runtimeId, created_at: createdAt, source_size: sourceBytes.byteLength, label, selected: false, execution_mode: executionMode, sdk_version: executionMode === 'strategy' ? input.sdkVersion! : null, sdk_digest: executionMode === 'strategy' ? input.sdkDigest! : null };
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      if (finalized) await rm(absolutePath, { force: true }).catch(() => {});
      throw error;
    }
  }

  listForOwner(botId: string, ownerId: string): BotRevisionRecord[] {
    const rows = this.db.prepare(`SELECT r.revision_id, r.bot_id, r.owner_id, r.source_digest,
      r.storage_ref, r.runtime_id, r.created_at, r.source_size, r.label,
      r.execution_mode, r.sdk_version, r.sdk_digest,
      CASE WHEN b.current_revision_id = r.revision_id THEN 1 ELSE 0 END AS selected
      FROM bot_revisions r JOIN bots b ON b.id = r.bot_id
      WHERE r.bot_id = ? AND r.owner_id = ? AND b.owner_id = ?
      ORDER BY r.created_at DESC, r.revision_id DESC`).all(botId, ownerId, ownerId) as RevisionRow[];
    return rows.map(row => this.map(row));
  }

  findOwned(botId: string, revisionId: string, ownerId: string): BotRevisionRecord | null {
    const row = this.db.prepare(`SELECT r.revision_id, r.bot_id, r.owner_id, r.source_digest,
      r.storage_ref, r.runtime_id, r.created_at, r.source_size, r.label,
      r.execution_mode, r.sdk_version, r.sdk_digest,
      CASE WHEN b.current_revision_id = r.revision_id THEN 1 ELSE 0 END AS selected
      FROM bot_revisions r JOIN bots b ON b.id = r.bot_id
      WHERE r.bot_id = ? AND r.revision_id = ? AND r.owner_id = ? AND b.owner_id = ?`)
      .get(botId, revisionId, ownerId, ownerId) as RevisionRow | undefined;
    return row ? this.map(row) : null;
  }

  async readSource(revision: BotRevisionRecord): Promise<string> {
    const absolutePath = await this.preparePath(revision.storage_ref, false);
    const bytes = await readFile(absolutePath);
    if (bytes.byteLength !== revision.source_size) throw new Error('Source artifact size mismatch');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== revision.source_digest) throw new Error('Source integrity check failed');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Source artifact is not valid UTF-8');
    }
  }

  select(botId: string, revisionId: string, ownerId: string): BotRevisionRecord | null {
    const transaction = this.db.transaction(() => {
      const revision = this.db.prepare(`SELECT revision_id FROM bot_revisions
        WHERE revision_id = ? AND bot_id = ? AND owner_id = ?`).get(revisionId, botId, ownerId) as { revision_id: string } | undefined;
      if (!revision) return false;
      const result = this.db.prepare(`UPDATE bots SET current_revision_id = ? WHERE id = ? AND owner_id = ?`).run(revisionId, botId, ownerId);
      return result.changes === 1;
    });
    if (!transaction()) return null;
    return this.findOwned(botId, revisionId, ownerId);
  }

  async delete(botId: string, revisionId: string, ownerId: string): Promise<boolean> {
    const revision = this.db.prepare(`SELECT revision_id, storage_ref FROM bot_revisions
      WHERE revision_id = ? AND bot_id = ? AND owner_id = ?`).get(revisionId, botId, ownerId) as { revision_id: string; storage_ref: string } | undefined;
    if (!revision) return false;
    const result = this.db.prepare('DELETE FROM bot_revisions WHERE revision_id = ? AND bot_id = ? AND owner_id = ?').run(revisionId, botId, ownerId);
    if (result.changes !== 1) return false;
    await rm(await this.preparePath(revision.storage_ref, false), { force: true });
    return true;
  }

  hasRevisions(botId: string, ownerId: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM bot_revisions WHERE bot_id = ? AND owner_id = ? LIMIT 1`).get(botId, ownerId);
    return Boolean(row);
  }

  private async preparePath(storageRef: string, createParent: boolean): Promise<string> {
    if (!storageRef.startsWith('bot-revisions/') || storageRef.includes('..') || path.isAbsolute(storageRef)) throw new Error('Invalid source storage reference');
    const root = path.resolve(this.storageRoot);
    await mkdir(root, { recursive: true });
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Invalid source storage root');
    const absolutePath = path.resolve(root, ...storageRef.split('/'));
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid source storage reference');
    const parent = path.dirname(absolutePath);
    if (createParent) await mkdir(parent, { recursive: true });
    const parentStat = await lstat(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('Invalid source storage directory');
    return absolutePath;
  }

  private map(row: RevisionRow): BotRevisionRecord {
    return { ...row, selected: row.selected === 1 };
  }
}

export function isSupportedSourceRuntime(value: unknown): value is SupportedSourceRuntime {
  return typeof value === 'string' && (SUPPORTED_SOURCE_RUNTIMES as readonly string[]).includes(value);
}
