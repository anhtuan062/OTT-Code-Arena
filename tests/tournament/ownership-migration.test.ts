import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createTournament } from '@tournament/persistence.js';
import { migrateLegacyTournamentOwnership } from '@tournament/ownership-migration.js';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function setup(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-owner-migration-'));
  dirs.push(dir);
  return dir;
}

async function writeTournament(baseDir: string, id: string, ownerId?: string): Promise<string> {
  const dir = path.join(baseDir, id);
  await fs.mkdir(dir, { recursive: true });
  const tournament = createTournament(id, id);
  if (ownerId) tournament.metadata = { ownerId, access: 'private' };
  const file = path.join(dir, 'tournament.json');
  await fs.writeFile(file, JSON.stringify(tournament, null, 2), 'utf8');
  return file;
}

describe('legacy tournament ownership migration', () => {
  it('reports ambiguous legacy tournaments during dry run without changing files', async () => {
    const dir = await setup();
    const file = await writeTournament(dir, 'legacy-one');
    const before = await fs.readFile(file, 'utf8');
    const report = await migrateLegacyTournamentOwnership(dir, {}, { dryRun: true, ownerExists: () => true });
    expect(report[0]?.status).toBe('ambiguous');
    expect(await fs.readFile(file, 'utf8')).toBe(before);
  });

  it('applies only valid explicit mappings and is idempotent', async () => {
    const dir = await setup();
    await writeTournament(dir, 'mapped', undefined);
    await writeTournament(dir, 'owned', 'user-1');
    await writeTournament(dir, 'invalid', undefined);
    await fs.mkdir(path.join(dir, 'broken'), { recursive: true });
    await fs.writeFile(path.join(dir, 'broken', 'tournament.json'), '{bad', 'utf8');

    const options = { dryRun: false, ownerExists: (id: string) => id === 'user-1' };
    const first = await migrateLegacyTournamentOwnership(dir, {
      mapped: 'user-1',
      invalid: 'missing-user',
    }, options);
    expect(first.find(entry => entry.tournamentId === 'mapped')?.status).toBe('migrated');
    expect(first.find(entry => entry.tournamentId === 'invalid')?.status).toBe('invalid-owner');
    expect(first.find(entry => entry.tournamentId === 'broken')?.status).toBe('malformed');
    const migrated = JSON.parse(await fs.readFile(path.join(dir, 'mapped', 'tournament.json'), 'utf8'));
    expect(migrated.metadata.ownerId).toBe('user-1');
    expect(migrated.metadata.access).toBe('private');
    expect(first.find(entry => entry.tournamentId === 'mapped')?.backupPath).toBeTruthy();

    const second = await migrateLegacyTournamentOwnership(dir, {}, options);
    expect(second.find(entry => entry.tournamentId === 'mapped')?.status).toBe('already-owned');
  });
});
