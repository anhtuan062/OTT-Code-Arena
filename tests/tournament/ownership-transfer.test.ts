import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createTournament } from '@tournament/persistence.js';
import { StorageOwnership } from '@tournament/ownership.js';
import { transferTournamentOwnership } from '@tournament/ownership-transfer.js';

describe('controlled tournament ownership transfer', () => {
  const dirs: string[] = [];
  afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

  async function fixture(ownerId = 'competitor-1') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-transfer-'));
    dirs.push(dir);
    const tournament = createTournament('t-1', 'Legacy');
    tournament.metadata = { ownerId, access: 'private' };
    await fs.mkdir(path.join(dir, 't-1'), { recursive: true });
    await fs.writeFile(path.join(dir, 't-1', 'tournament.json'), JSON.stringify(tournament), 'utf8');
    return dir;
  }

  it('dry-runs only explicitly selected tournaments without changing them', async () => {
    const dir = await fixture();
    const before = await fs.readFile(path.join(dir, 't-1', 'tournament.json'), 'utf8');
    const result = await transferTournamentOwnership({
      baseDir: dir,
      sourceOwnerId: 'competitor-1',
      destinationOwnerId: 'organizer-1',
      tournamentIds: ['t-1'],
      destinationRole: () => 'organizer',
    });
    expect(result[0]?.status).toBe('eligible');
    expect(await fs.readFile(path.join(dir, 't-1', 'tournament.json'), 'utf8')).toBe(before);
  });

  it('rejects an active storage owner before apply or dry-run', async () => {
    const dir = await fixture();
    const owner = new StorageOwnership(dir);
    await owner.acquire();
    try {
      await expect(transferTournamentOwnership({
        baseDir: dir,
        sourceOwnerId: 'competitor-1',
        destinationOwnerId: 'organizer-1',
        tournamentIds: ['t-1'],
        destinationRole: () => 'organizer',
      })).rejects.toThrow('already owned');
    } finally {
      owner.release();
    }
  });

  it('requires backup verification and explicit confirmation before apply', async () => {
    const dir = await fixture();
    await expect(transferTournamentOwnership({
      baseDir: dir,
      sourceOwnerId: 'competitor-1',
      destinationOwnerId: 'organizer-1',
      tournamentIds: ['t-1'],
      destinationRole: () => 'organizer',
      dryRun: false,
    })).rejects.toThrow('verified backups');
  });

  it('applies only an explicitly confirmed transfer and preserves tournament data', async () => {
    const dir = await fixture();
    const result = await transferTournamentOwnership({
      baseDir: dir,
      sourceOwnerId: 'competitor-1',
      destinationOwnerId: 'organizer-1',
      tournamentIds: ['t-1'],
      destinationRole: () => 'organizer',
      dryRun: false,
      backupsVerified: true,
      confirmation: 'TRANSFER_TOURNAMENT_OWNERSHIP',
    });
    expect(result[0]?.status).toBe('transferred');
    const migrated = JSON.parse(await fs.readFile(path.join(dir, 't-1', 'tournament.json'), 'utf8')) as { metadata?: { ownerId?: string } };
    expect(migrated.metadata?.ownerId).toBe('organizer-1');
    expect(result[0]?.backupPath).toBeTruthy();
  });
});
