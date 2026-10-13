import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { appExport, closeServer, initServer } from '../../server/index.js';
import { initializeDatabase } from '../../server/db.js';
import { SqlBotRepository } from '../../server/repositories/bot-repository.js';
import { SqlUserRepository } from '../../server/repositories/user-repository.js';

describe('role foundation', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-role-'));
    await initServer(dir);
  });

  afterEach(async () => {
    closeServer();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('migrates a fresh database with exactly the two supported roles', async () => {
    const db = await initializeDatabase({ path: path.join(dir, 'roles.sqlite') });
    try {
      const users = new SqlUserRepository(db);
      const competitor = users.create({ username: 'competitor', passwordHash: 'hash' });
      const organizer = users.create({ username: 'organizer', passwordHash: 'hash', role: 'organizer' });
      expect(competitor.role).toBe('competitor');
      expect(organizer.role).toBe('organizer');
      expect(() => users.create({ username: 'invalid', passwordHash: 'hash', role: 'admin' as never })).toThrow();
    } finally {
      db.close();
    }
  });

  it('upgrades an existing v1 database without replacing account data', async () => {
    const databasePath = path.join(dir, 'legacy.sqlite');
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT);
      INSERT INTO users (id, username, password_hash, created_at) VALUES ('legacy-1', 'legacy', 'preserve-me', '2026-01-01T00:00:00.000Z');
    `);
    legacy.close();

    const db = await initializeDatabase({ path: databasePath });
    try {
      const user = new SqlUserRepository(db).findById('legacy-1');
      expect(user).toMatchObject({ id: 'legacy-1', username: 'legacy', password_hash: 'preserve-me', role: 'competitor' });
      expect((db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as { version: number }).version).toBe(4);
      expect((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('bots', 'sessions', 'rate_limits')").all() as Array<{ name: string }>).map(row => row.name).sort()).toEqual(['bots', 'rate_limits', 'sessions']);
    } finally {
      db.close();
    }
    const dbAgain = await initializeDatabase({ path: databasePath });
    dbAgain.close();
  });

  it('defaults public registration to competitor and exposes the persisted role', async () => {
    const agent = request.agent(appExport);
    const registered = await agent.post('/api/auth/register').send({ username: 'roleuser', password: 'correct horse battery staple' });
    expect(registered.status).toBe(201);
    expect(registered.body.user.role).toBe('competitor');
    expect((await agent.get('/api/auth/me')).body.user.role).toBe('competitor');
    expect((await request(appExport).post('/api/auth/login').send({ username: 'roleuser', password: 'correct horse battery staple' })).body.user.role).toBe('competitor');
    expect((await request(appExport).post('/api/auth/register').send({ username: 'selforg', password: 'correct horse battery staple', role: 'organizer' })).body.user?.role).not.toBe('organizer');
  });

  it('preserves bot ownership across role-aware database reads', async () => {
    const db = await initializeDatabase({ path: path.join(dir, 'preserve.sqlite') });
    try {
      const users = new SqlUserRepository(db);
      const bots = new SqlBotRepository(db);
      const user = users.create({ username: 'botowner', passwordHash: 'hash' });
      const bot = bots.create({ ownerId: user.id, name: 'legacy', command: 'node', args: ['bot.js'] });
      expect(bots.listByOwner(user.id).map(item => item.id)).toEqual([bot.id]);
      expect(users.findById(user.id)?.role).toBe('competitor');
    } finally {
      db.close();
    }
  });
});
