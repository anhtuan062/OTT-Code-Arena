import bcrypt from 'bcryptjs';
import path from 'node:path';
import { initializeDatabase } from '../server/db.js';
import { SqlUserRepository, type UserRole } from '../server/repositories/user-repository.js';

/**
 * Creates the deliberately simple accounts used by the local demo/test guide.
 * This command is intentionally unavailable in production because the
 * credentials are public and use a weak password.
 */
const DEMO_ACCOUNTS: ReadonlyArray<{ username: string; role: UserRole; password: string }> = [
  { username: 'admin', role: 'organizer', password: '1' },
  { username: '1', role: 'competitor', password: '1' },
];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveDatabasePath(): string {
  const explicit = argument('--db');
  if (explicit) return path.resolve(explicit);
  return path.resolve(process.env.TOURNAMENT_DATA_DIR ?? 'data/tournaments', 'arena.sqlite');
}

async function seedDemoAccounts(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_ACCOUNTS !== 'true') {
    throw new Error('Demo accounts are disabled in production. Set ALLOW_DEMO_ACCOUNTS=true only for an isolated test environment.');
  }

  const db = await initializeDatabase({ path: resolveDatabasePath() });
  try {
    const users = new SqlUserRepository(db);
    const hashByPassword = new Map<string, string>();
    const result = db.transaction(() => {
      for (const account of DEMO_ACCOUNTS) {
        const passwordHash = hashByPassword.get(account.password);
        const hash = passwordHash ?? bcrypt.hashSync(account.password, 12);
        hashByPassword.set(account.password, hash);
        const existing = users.findByUsername(account.username);
        if (existing) {
          db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?').run(hash, account.role, existing.id);
          continue;
        }
        users.create({ username: account.username, passwordHash: hash, role: account.role });
      }
    })();
    void result;
    console.log(`Đã sẵn sàng tài khoản demo trong ${resolveDatabasePath()}: admin/1 và 1/1.`);
  } finally {
    db.close();
  }
}

seedDemoAccounts().catch(error => {
  console.error(`Không thể tạo tài khoản demo: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
