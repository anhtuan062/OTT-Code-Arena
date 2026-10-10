import * as fs from 'fs/promises';
import * as path from 'path';
import { initializeDatabase } from './db.js';
import { SqlUserRepository } from './repositories/user-repository.js';
import { migrateLegacyTournamentOwnership } from '../tournament/ownership-migration.js';

interface MappingFile {
  [tournamentId: string]: string;
}

async function main(): Promise<void> {
  const [baseDir, mappingPath, databasePath, mode] = process.argv.slice(2);
  if (!baseDir || !mappingPath || !databasePath || (mode !== undefined && mode !== '--apply')) {
    throw new Error('Usage: tsx server/migrate-ownership.ts <tournament-dir> <mapping.json> <database.sqlite> [--apply]');
  }
  const mappings = JSON.parse(await fs.readFile(path.resolve(mappingPath), 'utf8')) as MappingFile;
  const db = await initializeDatabase({ path: path.resolve(databasePath) });
  try {
    const users = new SqlUserRepository(db);
    const report = await migrateLegacyTournamentOwnership(path.resolve(baseDir), mappings, {
      dryRun: mode !== '--apply',
      ownerExists: ownerId => users.findById(ownerId) !== null,
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Ownership migration failed');
  process.exitCode = 1;
});
