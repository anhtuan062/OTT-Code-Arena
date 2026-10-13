import { fileURLToPath } from 'node:url';
import { initializeDatabase } from '../db.js';
import { SqlUserRepository } from '../repositories/user-repository.js';
import { transferTournamentOwnership } from '../../tournament/ownership-transfer.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function runOwnershipTransferTool(argv = process.argv): Promise<void> {
  const databasePath = argument('--db');
  const baseDir = argument('--tournaments');
  const sourceOwnerId = argument('--source-owner');
  const destinationOwnerId = argument('--destination-owner');
  const ids = argument('--tournament-ids')?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
  const apply = argv.includes('--apply');
  if (!databasePath || !baseDir || !sourceOwnerId || !destinationOwnerId || ids.length === 0) {
    throw new Error('Usage: --db <arena.sqlite> --tournaments <data directory> --source-owner <id> --destination-owner <id> --tournament-ids <id,...> [--apply --backup-verified --confirm TRANSFER_TOURNAMENT_OWNERSHIP]');
  }

  const db = await initializeDatabase({ path: databasePath, readonly: true });
  try {
    const users = new SqlUserRepository(db);
    const report = await transferTournamentOwnership({
      baseDir,
      sourceOwnerId,
      destinationOwnerId,
      tournamentIds: ids,
      destinationRole: userId => users.findById(userId)?.role ?? null,
      dryRun: !apply,
      backupsVerified: argv.includes('--backup-verified'),
      confirmation: argument('--confirm'),
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  runOwnershipTransferTool().catch(error => {
    console.error(`Ownership transfer failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
