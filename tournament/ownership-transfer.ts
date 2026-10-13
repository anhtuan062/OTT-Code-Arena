import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageOwnership } from './ownership.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type OwnershipTransferStatus = 'eligible' | 'transferred' | 'already-destination' | 'invalid' | 'failed';

export interface OwnershipTransferEntry {
  tournamentId: string;
  status: OwnershipTransferStatus;
  sourceOwnerId?: string;
  destinationOwnerId?: string;
  backupPath?: string;
  error?: string;
}

export interface OwnershipTransferOptions {
  baseDir: string;
  sourceOwnerId: string;
  destinationOwnerId: string;
  tournamentIds: string[];
  destinationRole: (userId: string) => Promise<'competitor' | 'organizer' | null> | 'competitor' | 'organizer' | null;
  dryRun?: boolean;
  backupsVerified?: boolean;
  confirmation?: string;
}

/**
 * Explicit, operator-controlled transfer. Dry-run is the default. The
 * ownership transaction blocks an active server writer and is never deleted
 * manually to recover from a crash.
 */
export async function transferTournamentOwnership(options: OwnershipTransferOptions): Promise<OwnershipTransferEntry[]> {
  const dryRun = options.dryRun !== false;
  if (!SAFE_ID.test(options.sourceOwnerId) || !SAFE_ID.test(options.destinationOwnerId)) {
    throw new Error('Source and destination user IDs must be safe identifiers');
  }
  if (options.sourceOwnerId === options.destinationOwnerId) throw new Error('Source and destination owners must differ');
  if (options.tournamentIds.length === 0 || options.tournamentIds.some(id => !SAFE_ID.test(id))) {
    throw new Error('Explicit safe tournament IDs are required');
  }
  if (await options.destinationRole(options.destinationOwnerId) !== 'organizer') {
    throw new Error('Destination account must have organizer role');
  }
  if (!dryRun && (!options.backupsVerified || options.confirmation !== 'TRANSFER_TOURNAMENT_OWNERSHIP')) {
    throw new Error('Apply mode requires verified backups and explicit confirmation');
  }

  const ownership = new StorageOwnership(options.baseDir);
  await ownership.acquire();
  try {
    const baseDir = ownership.canonicalDirectory;
    const results: OwnershipTransferEntry[] = [];
    for (const tournamentId of options.tournamentIds) {
      const file = path.join(baseDir, tournamentId, 'tournament.json');
      try {
        const tournament = JSON.parse(await fs.readFile(file, 'utf8')) as {
          tournamentId?: unknown;
          metadata?: Record<string, unknown>;
        };
        const currentOwner = tournament.metadata?.ownerId;
        if (tournament.tournamentId !== tournamentId || typeof currentOwner !== 'string') {
          results.push({ tournamentId, status: 'invalid', error: 'Malformed tournament identity or owner metadata' });
          continue;
        }
        if (currentOwner === options.destinationOwnerId) {
          results.push({ tournamentId, status: 'already-destination', sourceOwnerId: currentOwner, destinationOwnerId: options.destinationOwnerId });
          continue;
        }
        if (currentOwner !== options.sourceOwnerId) {
          results.push({ tournamentId, status: 'invalid', sourceOwnerId: currentOwner, destinationOwnerId: options.destinationOwnerId, error: 'Current owner does not match explicit source owner' });
          continue;
        }
        if (dryRun) {
          results.push({ tournamentId, status: 'eligible', sourceOwnerId: currentOwner, destinationOwnerId: options.destinationOwnerId });
          continue;
        }

        const tempFile = `${file}.${randomUUID()}.tmp`;
        const backupFile = `${file}.${randomUUID()}.bak`;
        try {
          const migrated = { ...tournament, metadata: { ...(tournament.metadata ?? {}), ownerId: options.destinationOwnerId, access: 'private' } };
          await fs.writeFile(tempFile, JSON.stringify(migrated, null, 2), 'utf8');
          await fs.rename(file, backupFile);
          try { await fs.rename(tempFile, file); }
          catch (error) { await fs.rename(backupFile, file).catch(() => {}); throw error; }
          results.push({ tournamentId, status: 'transferred', sourceOwnerId: currentOwner, destinationOwnerId: options.destinationOwnerId, backupPath: backupFile });
        } catch (error) {
          await fs.rm(tempFile, { force: true }).catch(() => {});
          results.push({ tournamentId, status: 'failed', sourceOwnerId: currentOwner, destinationOwnerId: options.destinationOwnerId, error: String(error) });
        }
      } catch (error) {
        results.push({ tournamentId, status: 'invalid', destinationOwnerId: options.destinationOwnerId, error: String(error) });
      }
    }
    return results;
  } finally {
    ownership.release();
  }
}
