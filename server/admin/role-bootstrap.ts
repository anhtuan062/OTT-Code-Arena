import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, closeSharedDatabase } from '../db.js';
import { SqlUserRepository, isUserRole, type UserRole } from '../repositories/user-repository.js';

export async function createControlledAccount(
  databasePath: string,
  username: string,
  password: string,
  role: UserRole
): Promise<{ id: string; username: string; role: UserRole }> {
  if (!isUserRole(role)) throw new Error('Invalid role');
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) throw new Error('Invalid username');
  if (password.length < 12 || password.length > 128) throw new Error('Invalid password length');

  const db = await initializeDatabase({ path: databasePath });
  try {
    const users = new SqlUserRepository(db);
    if (users.exists(username)) throw new Error('Username already exists');
    const user = users.create({
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role,
    });
    return { id: user.id, username: user.username, role: user.role };
  } finally {
    db.close();
  }
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').trimEnd();
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function runRoleBootstrap(argv = process.argv): Promise<void> {
  const databasePath = argument('--db');
  const username = argument('--username');
  const role = argument('--role') as UserRole | undefined;
  if (!databasePath || !username || !role || !isUserRole(role) || !argv.includes('--password-stdin')) {
    throw new Error('Usage: --db <arena.sqlite> --username <name> --role <competitor|organizer> --password-stdin');
  }
  const password = await readPasswordFromStdin();
  const result = await createControlledAccount(databasePath, username, password, role);
  console.log(`Created ${result.role} account ${result.username} (${result.id}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  runRoleBootstrap().catch(error => {
    console.error(`Role bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }).finally(() => closeSharedDatabase());
}
