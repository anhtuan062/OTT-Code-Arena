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
  loadMatchResult(tournamentId: string, matchId: string): Promise<TournamentMatchRecord | null>;
  loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null>;
  listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]>;
  close?(): void;
}

export interface TournamentStorageConfig {
  baseDir: string;
  indent?: number;
}

/**
 * File-based tournament repository
 */
export class FileTournamentRepository implements TournamentRepository {
  private baseDir: string;
  private indent: number;
  private readonly writeLocks = new Map<string, Promise<void>>();
  private readonly ownership: StorageOwnership;
  private initialization?: Promise<void>;
  private activeWrites = 0;
  private closeRequested = false;

  constructor(config: TournamentStorageConfig) {
    this.baseDir = path.resolve(config.baseDir);
    this.indent = config.indent ?? 2;
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
    await this.withWriteLock(`tournament:${tournament.tournamentId}`, () => this.saveUnlocked(tournament));
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
    const file = this.getTournamentFile(tournamentId);
    try {
      const data = await fs.readFile(file, 'utf-8');
      return JSON.parse(data) as Tournament;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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
        await this.ensureOwnership();
        await fs.rename(path.join(dir, backups[0]!), file);
        return JSON.parse(await fs.readFile(file, 'utf-8')) as Tournament;
      }
      throw error;
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
    await this.withWriteLock(`match:${tournamentId}:${matchId}`, () =>
      this.saveMatchResultUnlocked(tournamentId, matchId, result, replay));
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
    const pair = await this.loadCommittedMatch(tournamentId, matchId);
    return pair?.result ?? null;
  }

  /**
   * Load replay
   */
  async loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const pair = await this.loadCommittedMatch(tournamentId, matchId);
    return pair?.replay ?? null;
  }

  private async loadCommittedMatch(tournamentId: string, matchId: string): Promise<{
    result: TournamentMatchRecord;
    replay: MatchReplay;
  } | null> {
    const resultFile = this.getMatchResultFile(tournamentId, matchId);
    const replayFile = this.getReplayFile(tournamentId, matchId);
    const commitFile = this.getMatchCommitFile(tournamentId, matchId);
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
      // Explicit legacy compatibility: markerless pairs are accepted only
      // when both JSON documents identify the same match. They cannot provide
      // the hash-based protection of new writes and should be migrated before
      // multi-writer operation is ever supported.
      if (result.matchId !== matchId || replay.matchId !== matchId || result.replayRef !== matchId) {
        throw new Error(`Inconsistent legacy persisted match ${matchId}`);
      }
      return { result, replay };
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
    return { result, replay };
  }

  /**
   * List all match results for a tournament
   */
  async listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]> {
    this.assertSafeId(tournamentId, 'tournament');
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
      for (const matchId of matchIds) {
        const pair = await this.loadCommittedMatch(tournamentId, matchId);
        if (pair) results.push(pair.result);
      }
      return results;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
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
