import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from '../db.js';
import { SqlUserRepository } from '../repositories/user-repository.js';

export interface LegacyOwnershipReport {
  users: Array<{ id: string; username: string; role: string; botCount: number; tournamentIds: string[]; hasBothResponsibilities: boolean }>;
  orphanedOrAmbiguousTournaments: Array<{ tournamentId: string; reason: string }>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function inspectLegacyOwnership(databasePath: string, tournamentDir: string): Promise<LegacyOwnershipReport> {
  const db = await initializeDatabase({ path: databasePath, readonly: true });
  try {
    const users = new SqlUserRepository(db).listAll();
    const userMap = new Map(users.map(user => [user.id, user]));
    const tournamentIdsByUser = new Map<string, string[]>();
    const orphanedOrAmbiguousTournaments: LegacyOwnershipReport['orphanedOrAmbiguousTournaments'] = [];
    const entries = await fs.readdir(tournamentDir, { withFileTypes: true }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });

    for (const entry of entries) {
      if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
      const tournamentId = entry.name;
      try {
        const tournament = JSON.parse(await fs.readFile(path.join(tournamentDir, tournamentId, 'tournament.json'), 'utf8')) as {
          tournamentId?: unknown;
          metadata?: { ownerId?: unknown };
        };
        const ownerId = tournament.metadata?.ownerId;
        if (tournament.tournamentId !== tournamentId || typeof ownerId !== 'string' || !SAFE_ID.test(ownerId)) {
          orphanedOrAmbiguousTournaments.push({ tournamentId, reason: 'missing or malformed owner metadata' });
        } else if (!userMap.has(ownerId)) {
          orphanedOrAmbiguousTournaments.push({ tournamentId, reason: `owner ${ownerId} does not exist` });
        } else {
          const ids = tournamentIdsByUser.get(ownerId) ?? [];
          ids.push(tournamentId);
          tournamentIdsByUser.set(ownerId, ids);
        }
      } catch {
        orphanedOrAmbiguousTournaments.push({ tournamentId, reason: 'malformed or unreadable tournament JSON' });
      }
    }

    const botCounts = new Map<string, number>();
    for (const row of db.prepare('SELECT owner_id, COUNT(*) AS count FROM bots GROUP BY owner_id').all() as Array<{ owner_id: string; count: number }>) {
      botCounts.set(row.owner_id, row.count);
    }
    return {
      users: users.map(user => {
        const tournamentIds = tournamentIdsByUser.get(user.id) ?? [];
        const botCount = botCounts.get(user.id) ?? 0;
        return { id: user.id, username: user.username, role: user.role, botCount, tournamentIds, hasBothResponsibilities: botCount > 0 && tournamentIds.length > 0 };
      }),
      orphanedOrAmbiguousTournaments,
    };
  } finally {
    db.close();
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  const databasePath = argument('--db');
  const tournamentDir = argument('--tournaments');
  if (!databasePath || !tournamentDir) {
    console.error('Usage: --db <arena.sqlite> --tournaments <data directory>');
    process.exitCode = 1;
  } else {
    inspectLegacyOwnership(databasePath, tournamentDir).then(report => {
      console.log(JSON.stringify(report, null, 2));
    }).catch(error => {
      console.error(`Legacy ownership report failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
  }
}
