/**
 * Tournament Manager - Persistence Layer
 *
 * File-based repository for tournament data with atomic writes
 * and recovery support.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  Tournament,
  TournamentParticipant,
  TournamentRound,
  TournamentPairing,
  TournamentMatchRecord,
  TournamentStanding,
  TournamentFormat,
  TournamentStatus,
  PairingStatus,
  DEFAULT_TOURNAMENT_MATCH_CONFIG,
  DEFAULT_SCORING_CONFIG,
} from './types.js';
import type { MatchReplay } from '@match-runner/types.js';
import { StorageOwnership } from './ownership.js';
import { applicationMetrics } from '../observability/metrics.js';
import { performance } from 'node:perf_hooks';

export interface TournamentRepository {
  save(tournament: Tournament): Promise<void>;
  load(tournamentId: string): Promise<Tournament | null>;
  list(): Promise<Tournament[]>;
  delete(tournamentId: string): Promise<void>;
  exists(tournamentId: string): Promise<boolean>;
  saveMatchResult(
    tournamentId: string,
    matchId: string,
    result: TournamentMatchRecord,
    replay: object
  ): Promise<void>;
  deleteMatchResult(tournamentId: string, matchId: string): Promise<void>;
  loadMatchResult(tournamentId: string, matchId: string): Promise<TournamentMatchRecord | null>;
  loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null>;
  loadCommittedMatchWithHashes(tournamentId: string, matchId: string): Promise<CommittedMatch | null>;
  listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]>;
  close?(): void;
}

export interface CommittedMatch {
  result: TournamentMatchRecord;
  replay: MatchReplay;
  resultHash: string;
  replayHash: string;
}

export interface TournamentStorageConfig {
  baseDir: string;
  indent?: number;
}

interface ReplayCacheEntry<T> {
  value: T;
  bytes: number;
  lastAccess: number;
  expiresAt: number;
  generation: number;
}

interface ReplayVersion {
  hash: string;
  key: string;
}

/**
 * Small, process-local LRU cache for validated replay payloads. The commit
 * marker hash is part of the lookup key; writes also invalidate the match
 * prefix so a replacement can never reuse the previous payload.
 */
class ReplayReadCache<T> {
  private readonly entries = new Map<string, ReplayCacheEntry<T>>();
  private readonly flights = new Map<string, { generation: number; promise: Promise<T> }>();
  private readonly generations = new Map<string, number>();
  private bytes = 0;

  constructor(
    private readonly maxEntries = 256,
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly ttlMs = 30_000,
  ) {}

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const generation = this.generations.get(key) ?? 0;
    const entry = this.entries.get(key);
    if (entry && entry.generation === generation && entry.expiresAt > now) {
      entry.lastAccess = now;
      applicationMetrics.increment('cache.replay.hits');
      return entry.value;
    }
    if (entry) this.remove(key, entry);

    const currentFlight = this.flights.get(key);
    if (currentFlight && currentFlight.generation === generation) {
      applicationMetrics.increment('cache.replay.singleflight');
      return currentFlight.promise;
    }

    applicationMetrics.increment('cache.replay.misses');
    const loadGeneration = generation;
    let flight!: Promise<T>;
    flight = Promise.resolve().then(loader).then(value => {
      if ((this.generations.get(key) ?? 0) === loadGeneration) this.set(key, value, loadGeneration);
      return value;
    }).finally(() => {
      if (this.flights.get(key)?.promise === flight) this.flights.delete(key);
    });
    this.flights.set(key, { generation: loadGeneration, promise: flight });
    return flight;
  }

  invalidate(prefix: string): void {
    for (const [key, entry] of [...this.entries]) {
      if (key.startsWith(prefix)) this.remove(key, entry);
    }
    for (const key of this.generations.keys()) {
      if (key.startsWith(prefix)) this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    }
    for (const key of this.flights.keys()) {
      if (key.startsWith(prefix)) this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
    }
  }

  private set(key: string, value: T, generation: number): void {
    const serialized = JSON.stringify(value);
    const bytes = serialized ? serialized.length * 2 : 0;
    if (bytes > this.maxBytes) return;
    const previous = this.entries.get(key);
    if (previous) this.remove(key, previous);
    const now = Date.now();
    this.entries.set(key, { value, bytes, lastAccess: now, expiresAt: now + this.ttlMs, generation });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0];
      if (!oldest) break;
      this.remove(oldest[0], oldest[1]);
      applicationMetrics.increment('cache.replay.evictions');
    }
  }

  private remove(key: string, entry: ReplayCacheEntry<T>): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    this.bytes = Math.max(0, this.bytes - entry.bytes);
  }
}

/**
 * File-based tournament repository
 */
export class FileTournamentRepository implements TournamentRepository {
  private baseDir: string;
  private indent: number;
  private readonly writeLocks = new Map<string, Promise<void>>();
  private readonly ownership: StorageOwnership;
  private readonly replayCache = new ReplayReadCache<CommittedMatch>();
  private initialization?: Promise<void>;
  private activeWrites = 0;
  private closeRequested = false;

  constructor(config: TournamentStorageConfig) {
    this.baseDir = path.resolve(config.baseDir);
    this.indent = config.indent ?? 0;
    this.ownership = new StorageOwnership(this.baseDir);
  }

  private getTournamentDir(tournamentId: string): string {
    this.assertSafeId(tournamentId, 'tournament');
    return path.join(this.baseDir, tournamentId);
  }

  private getTournamentFile(tournamentId: string): string {
    return path.join(this.getTournamentDir(tournamentId), 'tournament.json');
  }

  private getMatchResultFile(tournamentId: string, matchId: string): string {
    return path.join(this.getTournamentDir(tournamentId), `match-${matchId}.json`);
  }

  private getReplayFile(tournamentId: string, matchId: string): string {
    this.assertSafeId(matchId, 'match');
    return path.join(this.getTournamentDir(tournamentId), `replay-${matchId}.json`);
  }

  private getMatchCommitFile(tournamentId: string, matchId: string): string {
    return path.join(this.getTournamentDir(tournamentId), `match-${matchId}.commit.json`);
  }

  private assertSafeId(id: string, label: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
      throw new Error(`Invalid ${label} identifier`);
    }
  }

  private async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    await this.ensureOwnership();
    const previous = this.writeLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.writeLocks.set(key, current);
    this.activeWrites++;
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.writeLocks.get(key) === current) this.writeLocks.delete(key);
      this.activeWrites--;
      this.releaseIfIdle();
    }
  }

  async initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.ownership.acquire().then(() => {
        this.baseDir = this.ownership.canonicalDirectory;
      }).catch(error => {
        this.initialization = undefined;
        throw error;
      });
    }
    await this.initialization;
  }

  close(): void {
    this.closeRequested = true;
    this.releaseIfIdle();
  }

  private async ensureOwnership(): Promise<void> {
    if (this.closeRequested) throw new Error('Tournament repository is closed');
    await this.initialize();
    this.ownership.assertHeld();
  }

  private releaseIfIdle(): void {
    if (this.closeRequested && this.activeWrites === 0) {
      this.ownership.release();
    }
  }

  async save(tournament: Tournament): Promise<void> {
    this.assertSafeId(tournament.tournamentId, 'tournament');
    const startedAt = performance.now();
    try {
      await this.withWriteLock(`tournament:${tournament.tournamentId}`, () => this.saveUnlocked(tournament));
      this.replayCache.invalidate(`${tournament.tournamentId}:`);
    } finally {
      applicationMetrics.observe('persistence.write_ms', performance.now() - startedAt);
    }
  }

  private async saveUnlocked(tournament: Tournament): Promise<void> {
    const dir = this.getTournamentDir(tournament.tournamentId);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write with backup strategy for Windows compatibility
    // Strategy: write temp -> rename target to backup -> rename temp to target -> delete backup
    // This preserves the old file if any step fails
    const targetFile = this.getTournamentFile(tournament.tournamentId);
    const tempFile = `${targetFile}.${randomUUID()}.tmp`;
    const backupFile = `${targetFile}.${randomUUID()}.bak`;
    const data = JSON.stringify(tournament, null, this.indent);
    await fs.writeFile(tempFile, data, 'utf-8');

    try {
      // Try direct rename first (works on Unix, may fail on Windows if target exists)
      await fs.rename(tempFile, targetFile);
    } catch (error) {
      const errnoException = error as NodeJS.ErrnoException;
      if (errnoException.code === 'EPERM' || errnoException.code === 'EEXIST') {
        // On Windows, target exists. Use backup strategy.
        try {
          // Step 1: Rename existing target to backup (preserves old data)
          await fs.rename(targetFile, backupFile);
        } catch (renameError) {
          const renameErrno = renameError as NodeJS.ErrnoException;
          if (renameErrno.code !== 'ENOENT') {
            // If backup rename fails for reason other than file not existing, clean up temp and throw
            await fs.rm(tempFile, { force: true }).catch(() => {});
            throw renameError;
          }
          // If target doesn't exist, we can just rename temp to target
        }

        try {
          // Step 2: Rename temp to target
          await fs.rename(tempFile, targetFile);
        } catch (renameError) {
          // Step 2 failed - try to restore from backup
          await fs.rename(backupFile, targetFile).catch(() => {});
          await fs.rm(tempFile, { force: true }).catch(() => {});
          throw renameError;
        }

        // Step 3: Clean up backup (old data no longer needed)
        await fs.rm(backupFile, { force: true }).catch(() => {});
      } else {
        // Other error - clean up temp and throw
        await fs.rm(tempFile, { force: true }).catch(() => {});
        throw error;
      }
    }
  }

  async load(tournamentId: string): Promise<Tournament | null> {
    const startedAt = performance.now();
    const file = this.getTournamentFile(tournamentId);
    try {
      const data = await fs.readFile(file, 'utf-8');
      return JSON.parse(data) as Tournament;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // A writer briefly removes tournament.json while moving it to its
        // recovery backup on Windows. Recovery must join the same per-
        // tournament lock; otherwise a reader can steal that backup and race
        // the writer's temp-file rename, producing EPERM and/or lost state.
        return this.withWriteLock(`tournament:${tournamentId}`, async () => {
          try {
            return JSON.parse(await fs.readFile(file, 'utf-8')) as Tournament;
          } catch (retryError) {
            if ((retryError as NodeJS.ErrnoException).code !== 'ENOENT') throw retryError;
          }

          const dir = this.getTournamentDir(tournamentId);
          let entries: string[];
          try {
            entries = await fs.readdir(dir);
          } catch (directoryError) {
            if ((directoryError as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw directoryError;
          }
          const backups = entries.filter(entry => /^tournament\.json(?:\..+)?\.bak$/.test(entry));
          if (backups.length === 0) return null;
          if (backups.length > 1) {
            throw new Error(`Ambiguous tournament recovery for ${tournamentId}: multiple backup files exist`);
          }
          await fs.rename(path.join(dir, backups[0]!), file);
          return JSON.parse(await fs.readFile(file, 'utf-8')) as Tournament;
        });
      }
      throw error;
    } finally {
      applicationMetrics.observe('persistence.read_ms', performance.now() - startedAt);
    }
  }

  async list(): Promise<Tournament[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const tournaments: Tournament[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(entry.name)) {
          const tournament = await this.load(entry.name);
          if (tournament) {
            tournaments.push(tournament);
          }
        }
      }

      return tournaments.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async delete(tournamentId: string): Promise<void> {
    this.assertSafeId(tournamentId, 'tournament');
    await this.withWriteLock(`tournament:${tournamentId}`, async () => {
      const dir = this.getTournamentDir(tournamentId);
      await fs.rm(dir, { recursive: true, force: true });
      this.replayCache.invalidate(`${tournamentId}:`);
    });
  }

  async exists(tournamentId: string): Promise<boolean> {
    this.assertSafeId(tournamentId, 'tournament');
    const file = this.getTournamentFile(tournamentId);
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save match result and replay separately for efficient access
   */
  async saveMatchResult(
    tournamentId: string,
    matchId: string,
    result: TournamentMatchRecord,
    replay: object
  ): Promise<void> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const startedAt = performance.now();
    try {
      await this.withWriteLock(`match:${tournamentId}:${matchId}`, () =>
        this.saveMatchResultUnlocked(tournamentId, matchId, result, replay));
      this.replayCache.invalidate(`${tournamentId}:${matchId}:`);
    } finally {
      const durationMs = performance.now() - startedAt;
      applicationMetrics.observe('persistence.write_ms', durationMs);
      applicationMetrics.observe('persistence.commit_ms', durationMs);
    }
  }

  async deleteMatchResult(tournamentId: string, matchId: string): Promise<void> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    await this.withWriteLock(`match:${tournamentId}:${matchId}`, async () => {
      await Promise.all([
        fs.rm(this.getMatchResultFile(tournamentId, matchId), { force: true }),
        fs.rm(this.getReplayFile(tournamentId, matchId), { force: true }),
        fs.rm(this.getMatchCommitFile(tournamentId, matchId), { force: true }),
      ]);
      this.replayCache.invalidate(`${tournamentId}:${matchId}:`);
    });
  }

  private async saveMatchResultUnlocked(
    tournamentId: string,
    matchId: string,
    result: TournamentMatchRecord,
    replay: object
  ): Promise<void> {
    const dir = this.getTournamentDir(tournamentId);
    await fs.mkdir(dir, { recursive: true });

    const [resultFile, replayFile] = [
      this.getMatchResultFile(tournamentId, matchId),
      this.getReplayFile(tournamentId, matchId),
    ];

    const renameWithBackup = async (tempFile: string, targetFile: string) => {
      try {
        await fs.rename(tempFile, targetFile);
      } catch (error) {
        const errnoException = error as NodeJS.ErrnoException;
        if (errnoException.code === 'EPERM' || errnoException.code === 'EEXIST') {
          const backupFile = `${targetFile}.${randomUUID()}.bak`;
          try {
            await fs.rename(targetFile, backupFile);
          } catch (renameError) {
            const renameErrno = renameError as NodeJS.ErrnoException;
            if (renameErrno.code !== 'ENOENT') {
              await fs.rm(tempFile, { force: true }).catch(() => {});
              throw renameError;
            }
          }

          try {
            await fs.rename(tempFile, targetFile);
          } catch (renameError) {
            await fs.rename(backupFile, targetFile).catch(() => {});
            await fs.rm(tempFile, { force: true }).catch(() => {});
            throw renameError;
          }

          await fs.rm(backupFile, { force: true }).catch(() => {});
        } else {
          await fs.rm(tempFile, { force: true }).catch(() => {});
          throw error;
        }
      }
    };

    const resultData = JSON.stringify(result, null, this.indent);
    const replayData = JSON.stringify(replay, null, this.indent);
    await Promise.all([
      this.writeAndReplace(resultFile, resultData, renameWithBackup),
      this.writeAndReplace(replayFile, replayData, renameWithBackup),
    ]);

    // The marker is written last. Readers only accept a pair whose files and
    // hashes match this marker, so a crash between the two replacements cannot
    // expose a result/replay pair from different writes.
    const commit = {
      matchId,
      resultHash: createHash('sha256').update(resultData).digest('hex'),
      replayHash: createHash('sha256').update(replayData).digest('hex'),
    };
    await this.writeAndReplace(
      this.getMatchCommitFile(tournamentId, matchId),
      JSON.stringify(commit, null, this.indent),
      renameWithBackup
    );
  }

  private async writeAndReplace(
    targetFile: string,
    data: string,
    replace: (tempFile: string, targetFile: string) => Promise<void>
  ): Promise<void> {
    const tempFile = `${targetFile}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempFile, data, 'utf-8');
      await replace(tempFile, targetFile);
    } finally {
      await fs.rm(tempFile, { force: true }).catch(() => {});
    }
  }

  /**
   * Load match result
   */
  async loadMatchResult(tournamentId: string, matchId: string): Promise<TournamentMatchRecord | null> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const startedAt = performance.now();
    try {
      const pair = await this.loadCommittedMatchWithHashes(tournamentId, matchId);
      return pair?.result ?? null;
    } finally {
      applicationMetrics.observe('persistence.read_ms', performance.now() - startedAt);
    }
  }

  /**
   * Load replay
   */
  async loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const startedAt = performance.now();
    try {
      const version = await this.loadReplayVersion(tournamentId, matchId);
      if (version === null) return null;
      const key = `${tournamentId}:${matchId}:${version.key}`;
      const pair = await this.replayCache.getOrLoad(key, async () => {
        applicationMetrics.increment('cache.replay.source_reads');
        const loaded = await this.loadCommittedMatchWithHashes(tournamentId, matchId);
        if (!loaded || loaded.replayHash !== version.hash) {
          throw new Error(`Inconsistent persisted replay ${matchId}: commit version changed during read`);
        }
        return loaded;
      });
      return pair?.replay ?? null;
    } finally {
      applicationMetrics.observe('persistence.read_ms', performance.now() - startedAt);
    }
  }

  async loadCommittedMatchWithHashes(tournamentId: string, matchId: string): Promise<CommittedMatch | null> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const resultFile = this.getMatchResultFile(tournamentId, matchId);
    const replayFile = this.getReplayFile(tournamentId, matchId);
    const commitFile = this.getMatchCommitFile(tournamentId, matchId);
    applicationMetrics.increment('replay.persistence_reads');
    const read = async (file: string): Promise<string | null> => {
      try {
        return await fs.readFile(file, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    };

    const [resultData, replayData, commitData] = await Promise.all([
      read(resultFile), read(replayFile), read(commitFile),
    ]);
    if (resultData === null && replayData === null && commitData === null) return null;
    if (resultData === null || replayData === null) {
      throw new Error(`Incomplete persisted match ${matchId}: result, replay, and commit marker are required`);
    }

    const result = JSON.parse(resultData) as TournamentMatchRecord;
    const replay = JSON.parse(replayData) as MatchReplay;
    if (commitData === null) {
      // A markerless pair is ambiguous: it may be a genuine historical
      // artifact, or a modern write interrupted after both payloads but before
      // the commit marker. Normal loading must fail closed; any legacy
      // recovery requires a separately authorized, verified workflow.
      throw new Error(`Uncommitted persisted match ${matchId}: commit marker is required`);
    }
    const commit = JSON.parse(commitData) as {
      matchId?: string;
      resultHash?: string;
      replayHash?: string;
    };
    const resultHash = createHash('sha256').update(resultData).digest('hex');
    const replayHash = createHash('sha256').update(replayData).digest('hex');
    if (
      result.matchId !== matchId || replay.matchId !== matchId || commit.matchId !== matchId ||
      commit.resultHash !== resultHash || commit.replayHash !== replayHash ||
      result.replayRef !== matchId
    ) {
      throw new Error(`Inconsistent persisted match ${matchId}: result, replay, and commit marker do not match`);
    }
    return { result, replay, resultHash, replayHash };
  }

  private async loadReplayVersion(tournamentId: string, matchId: string): Promise<ReplayVersion | null> {
    applicationMetrics.increment('replay.version_reads');
    let data: string;
    try {
      data = await fs.readFile(this.getMatchCommitFile(tournamentId, matchId), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const commit = JSON.parse(data) as { matchId?: string; replayHash?: string };
    const replayHash = commit.replayHash;
    if (commit.matchId !== matchId || !/^[a-f0-9]{64}$/.test(replayHash ?? '')) {
      throw new Error(`Invalid persisted replay commit marker ${matchId}`);
    }
    let stat;
    try {
      stat = await fs.stat(this.getReplayFile(tournamentId, matchId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Incomplete persisted match ${matchId}: replay file is required`);
      }
      throw error;
    }
    return { hash: replayHash!, key: `${replayHash}:${stat.size}:${stat.mtimeMs}` };
  }

  /**
   * List all match results for a tournament
   */
  async listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]> {
    this.assertSafeId(tournamentId, 'tournament');
    const startedAt = performance.now();
    const dir = this.getTournamentDir(tournamentId);
    try {
      const files = await fs.readdir(dir);
      const matchIds = new Set<string>();
      for (const file of files) {
        if (file.startsWith('match-') && file.endsWith('.json')) {
          const suffix = file.endsWith('.commit.json') ? '.commit.json' : '.json';
          matchIds.add(file.slice('match-'.length, -suffix.length));
        } else if (file.startsWith('replay-') && file.endsWith('.json')) {
          matchIds.add(file.slice('replay-'.length, -'.json'.length));
        }
      }

      const results: TournamentMatchRecord[] = [];
      const matchIdList = Array.from(matchIds);
      const pairs = await Promise.all(matchIdList.map(mId => this.loadCommittedMatchWithHashes(tournamentId, mId)));
      for (const pair of pairs) {
        // BO3 per-game artifacts are committed independently for recovery,
        // but only the aggregate series record contributes to standings.
        if (pair && !pair.result.seriesGameOf) results.push(pair.result);
      }
      results.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeA - timeB;
      });
      return results;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    } finally {
      applicationMetrics.observe('persistence.read_ms', performance.now() - startedAt);
    }
  }
}

/**
 * Create a default tournament object with proper initialization
 */
export function createTournament(
  tournamentId: string,
  name: string,
  format: TournamentFormat = 'single_round_robin',
  matchConfig: Partial<typeof DEFAULT_TOURNAMENT_MATCH_CONFIG> = {},
  scoringConfig: Partial<typeof DEFAULT_SCORING_CONFIG> = {}
): Tournament {
  const now = new Date().toISOString();
  return {
    tournamentId,
    name,
    format,
    status: 'draft',
    participants: [],
    matchConfig: { ...DEFAULT_TOURNAMENT_MATCH_CONFIG, ...matchConfig },
    scoringConfig: { ...DEFAULT_SCORING_CONFIG, ...scoringConfig },
    rounds: [],
    standings: [],
    createdAt: now,
    registrationOpenedAt: null,
    registrationClosedAt: null,
    startedAt: null,
    completedAt: null,
    resultsPublishedAt: null,
    participationRequests: [],
  };
}

/**
 * Validate tournament state consistency
 */
export function validateTournament(tournament: Tournament): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!tournament.tournamentId) errors.push('Missing tournamentId');
  if (!tournament.name) errors.push('Missing name');
  if (!tournament.format) errors.push('Missing format');
  if (!tournament.status) errors.push('Missing status');

  // Check participant IDs are unique
  const participantIds = new Set<string>();
  for (const p of tournament.participants) {
    if (participantIds.has(p.participantId)) {
      errors.push(`Duplicate participant ID: ${p.participantId}`);
    }
    participantIds.add(p.participantId);
  }

  // Check pairing IDs are unique
  const pairingIds = new Set<string>();
  for (const round of tournament.rounds) {
    for (const pairing of round.pairings) {
      if (pairingIds.has(pairing.pairingId)) {
        errors.push(`Duplicate pairing ID: ${pairing.pairingId}`);
      }
      pairingIds.add(pairing.pairingId);
    }
  }

  // Check standings match participants
  const standingIds = new Set(tournament.standings.map(s => s.participantId));
  for (const pid of participantIds) {
    if (!standingIds.has(pid)) {
      errors.push(`Missing standing for participant: ${pid}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
