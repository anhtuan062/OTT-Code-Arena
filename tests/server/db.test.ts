import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  backupDatabase,
  closeSharedDatabase,
  initializeDatabase,
  restoreDatabase,
} from '../../server/db.js';
import { SqlUserRepository } from '../../server/repositories/user-repository.js';
import { SqlBotRepository } from '../../server/repositories/bot-repository.js';

const dirs: string[] = [];

afterEach(async () => {
  closeSharedDatabase();
  await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-db-'));
  dirs.push(dir);
  return dir;
}

describe('SQLite database lifecycle', () => {
  it('initializes idempotently and preserves records through backup and restore', async () => {
    const dir = await tempDir();
    const databasePath = path.join(dir, 'arena.sqlite');
    const backupPath = path.join(dir, 'backups', 'arena.sqlite');
    let db = await initializeDatabase({ path: databasePath });
    const users = new SqlUserRepository(db);
    const bots = new SqlBotRepository(db);
    const user = users.create({ username: 'backup-user', passwordHash: 'bcrypt-hash' });
    bots.create({ ownerId: user.id, name: 'backup-bot', command: 'node', args: ['bot.js'] });
    await backupDatabase(db, backupPath);
    db.close();

    db = await initializeDatabase({ path: databasePath });
    db.close();
    const previous = await restoreDatabase(backupPath, databasePath);
    expect(previous).toBeTruthy();

    const restored = await initializeDatabase({ path: databasePath });
    expect(new SqlUserRepository(restored).findByUsername('backup-user')).not.toBeNull();
    expect(new SqlBotRepository(restored).listByOwner(user.id)).toHaveLength(1);
    restored.close();
  });

  it('rejects overwriting an existing backup and invalid backups', async () => {
    const dir = await tempDir();
    const databasePath = path.join(dir, 'arena.sqlite');
    const backupPath = path.join(dir, 'backup.sqlite');
    const db = await initializeDatabase({ path: databasePath });
    await backupDatabase(db, backupPath);
    await expect(backupDatabase(db, backupPath)).rejects.toThrow('already exists');
    db.close();

    await fs.writeFile(path.join(dir, 'invalid.sqlite'), 'not sqlite', 'utf8');
    await expect(restoreDatabase(path.join(dir, 'invalid.sqlite'), path.join(dir, 'restored.sqlite')))
      .rejects.toThrow();
  });

  it('rejects unsupported future schema versions without opening the database', async () => {
    const dir = await tempDir();
    const databasePath = path.join(dir, 'arena.sqlite');
    const db = await initializeDatabase({ path: databasePath });
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(999);
    db.close();
    await expect(initializeDatabase({ path: databasePath })).rejects.toThrow('Unsupported database schema version');
  });
});
