import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Tournament } from './types.js';

export type OwnershipMigrationStatus =
  | 'eligible'
  | 'migrated'
  | 'already-owned'
  | 'ambiguous'
  | 'invalid-owner'
  | 'malformed'
  | 'failed';

export interface OwnershipMigrationEntry {
  tournamentId: string;
  status: OwnershipMigrationStatus;
  ownerId?: string;
  error?: string;
  backupPath?: string;
}

export interface OwnershipMigrationOptions {
  dryRun?: boolean;
  ownerExists: (ownerId: string) => Promise<boolean> | boolean;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function migrateLegacyTournamentOwnership(
  baseDir: string,
  mappings: Record<string, string>,
  options: OwnershipMigrationOptions
): Promise<OwnershipMigrationEntry[]> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  const results: OwnershipMigrationEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
    const tournamentId = entry.name;
    const file = path.join(baseDir, tournamentId, 'tournament.json');
    let tournament: Tournament;
    try {
      tournament = JSON.parse(await fs.readFile(file, 'utf8')) as Tournament;
    } catch {
      results.push({ tournamentId, status: 'malformed', error: 'Malformed or unreadable tournament JSON' });
      continue;
    }

    if (tournament.tournamentId !== tournamentId) {
      results.push({ tournamentId, status: 'malformed', error: 'Tournament identifier does not match directory name' });
      continue;
    }
    if (typeof tournament.metadata?.ownerId === 'string' && SAFE_ID.test(tournament.metadata.ownerId)) {
      results.push({ tournamentId, status: 'already-owned', ownerId: tournament.metadata.ownerId });
      continue;
    }

    const ownerId = mappings[tournamentId];
    if (!ownerId) {
      results.push({ tournamentId, status: 'ambiguous', error: 'No explicit owner mapping provided' });
      continue;
    }
    if (!SAFE_ID.test(ownerId) || !(await options.ownerExists(ownerId))) {
      results.push({ tournamentId, status: 'invalid-owner', ownerId, error: 'Mapped owner does not exist or is invalid' });
      continue;
    }

    if (options.dryRun) {
      results.push({ tournamentId, status: 'eligible', ownerId });
      continue;
    }

    const tempFile = `${file}.${randomUUID()}.tmp`;
    const backupFile = `${file}.${randomUUID()}.bak`;
    try {
      const migrated = { ...tournament, metadata: { ...(tournament.metadata ?? {}), ownerId, access: 'private' } };
      await fs.writeFile(tempFile, JSON.stringify(migrated, null, 2), 'utf8');
      await fs.rename(file, backupFile);
      try {
        await fs.rename(tempFile, file);
      } catch (error) {
        await fs.rename(backupFile, file).catch(() => {});
        throw error;
      }
      results.push({ tournamentId, status: 'migrated', ownerId, backupPath: backupFile });
    } catch (error) {
      await fs.rm(tempFile, { force: true }).catch(() => {});
      results.push({ tournamentId, status: 'failed', ownerId, error: String(error) });
    }
  }

  return results;
}
