/**
 * Tournament Manager - Persistence Layer
 *
 * File-based repository for tournament data with atomic writes
 * and recovery support.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
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

  constructor(config: TournamentStorageConfig) {
    this.baseDir = config.baseDir;
    this.indent = config.indent ?? 2;
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

  private assertSafeId(id: string, label: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
      throw new Error(`Invalid ${label} identifier`);
    }
  }

  private async withWriteLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    this.writeLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.writeLocks.get(key) === current) this.writeLocks.delete(key);
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
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
        return null;
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

    await Promise.all([
      this.writeAndReplace(resultFile, JSON.stringify(result, null, this.indent), renameWithBackup),
      this.writeAndReplace(replayFile, JSON.stringify(replay, null, this.indent), renameWithBackup),
    ]);
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
    const file = this.getMatchResultFile(tournamentId, matchId);
    try {
      const data = await fs.readFile(file, 'utf-8');
      return JSON.parse(data) as TournamentMatchRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Load replay
   */
  async loadReplay(tournamentId: string, matchId: string): Promise<MatchReplay | null> {
    this.assertSafeId(tournamentId, 'tournament');
    this.assertSafeId(matchId, 'match');
    const file = this.getReplayFile(tournamentId, matchId);
    try {
      const data = await fs.readFile(file, 'utf-8');
      return JSON.parse(data) as MatchReplay;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all match results for a tournament
   */
  async listMatchResults(tournamentId: string): Promise<TournamentMatchRecord[]> {
    this.assertSafeId(tournamentId, 'tournament');
    const dir = this.getTournamentDir(tournamentId);
    try {
      const files = await fs.readdir(dir);
      const resultFiles = files.filter(f => f.startsWith('match-') && f.endsWith('.json'));

      const results: TournamentMatchRecord[] = [];
      for (const file of resultFiles) {
        const data = await fs.readFile(path.join(dir, file), 'utf-8');
        results.push(JSON.parse(data));
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