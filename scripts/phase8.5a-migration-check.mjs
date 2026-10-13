import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeDatabase } from '../dist/server/db.js';

const root = path.resolve(process.argv[2] ?? '');
if (!root || root === path.parse(root).root) throw new Error('A dedicated migration evidence directory is required');
await mkdir(path.join(root, 'tournaments', 'legacy'), { recursive: true });
const dbPath = path.join(root, 'arena.sqlite');
const tournamentPath = path.join(root, 'tournaments', 'legacy', 'tournament.json');
const tournamentBytes = Buffer.from(JSON.stringify({ tournamentId: 'legacy-tournament', status: 'completed', results: ['legacy-match'] }));
await writeFile(tournamentPath, tournamentBytes, { flag: 'wx' });

const source = Buffer.from('legacy raw source\n');
const sourceDigest = createHash('sha256').update(source).digest('hex');
const legacy = new Database(dbPath);
legacy.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
  INSERT INTO schema_version VALUES (3);
  CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT, role TEXT NOT NULL DEFAULT 'competitor');
  CREATE TABLE bots (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, command TEXT NOT NULL, args TEXT NOT NULL, env TEXT, is_public INTEGER NOT NULL DEFAULT 0, registered_at TEXT NOT NULL, current_revision_id TEXT, FOREIGN KEY (owner_id) REFERENCES users(id));
  CREATE TABLE bot_revisions (revision_id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, owner_id TEXT NOT NULL, source_digest TEXT NOT NULL, storage_ref TEXT NOT NULL UNIQUE, runtime_id TEXT NOT NULL, created_at TEXT NOT NULL, source_size INTEGER NOT NULL, label TEXT, FOREIGN KEY (bot_id) REFERENCES bots(id), FOREIGN KEY (owner_id) REFERENCES users(id));
`);
legacy.prepare('INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)').run('legacy-user', 'legacy_user', 'preserved', '2026-01-01T00:00:00.000Z', 'competitor');
legacy.prepare('INSERT INTO bots (id, owner_id, name, command, args, registered_at) VALUES (?, ?, ?, ?, ?, ?)').run('legacy-bot', 'legacy-user', 'Legacy Bot', 'node', '[]', '2026-01-01T00:00:00.000Z');
legacy.prepare('INSERT INTO bot_revisions (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-revision', 'legacy-bot', 'legacy-user', sourceDigest, 'bot-revisions/legacy-bot/legacy.js', 'nodejs', '2026-01-01T00:00:00.000Z', source.byteLength, 'historical');
legacy.close();
await mkdir(path.join(root, 'bot-revisions', 'legacy-bot'), { recursive: true });
await writeFile(path.join(root, 'bot-revisions', 'legacy-bot', 'legacy.js'), source, { flag: 'wx' });

const db = await initializeDatabase({ path: dbPath });
const after = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
const revision = db.prepare('SELECT runtime_id, source_digest, execution_mode, sdk_version, sdk_digest FROM bot_revisions WHERE revision_id = ?').get('legacy-revision');
const user = db.prepare('SELECT username FROM users WHERE id = ?').get('legacy-user');
const bot = db.prepare('SELECT name FROM bots WHERE id = ?').get('legacy-bot');
db.close();
const second = await initializeDatabase({ path: dbPath });
second.close();
const tournamentAfter = await readFile(tournamentPath);
if (after.version !== 4 || user.username !== 'legacy_user' || bot.name !== 'Legacy Bot' || revision.runtime_id !== 'nodejs' || revision.source_digest !== sourceDigest || revision.execution_mode !== 'raw' || revision.sdk_version !== null || revision.sdk_digest !== null || !tournamentAfter.equals(tournamentBytes)) {
  throw new Error('Legacy migration invariants failed');
}
const manifest = { schemaVersion: after.version, userPreserved: true, botPreserved: true, revisionDigestPreserved: true, rawDefaulted: true, historicalRuntimePreserved: true, tournamentBytesPreserved: true, idempotent: true, evidenceRoot: root };
await writeFile(path.join(root, 'migration-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify(manifest));
