import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createLogicalSnapshot } = require('../../scripts/phase8.5c-logical-snapshot.cjs') as {
  createLogicalSnapshot(options: {
    repoRoot: string;
    databasePath: string;
    backupPath: string;
    dataPath: string;
  }): Promise<{ tables: Record<string, unknown[]>; files: Array<{ path: string }>; sha256: string }>;
};

const temporaryRoots: string[] = [];
afterEach(() => {
  // Close test handles before deleting the isolated temp root (important on Windows).
  for (const close of databaseClosers.splice(0)) close();
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const databaseClosers: Array<() => void> = [];

describe('Phase 8.5C WAL-safe logical snapshots', () => {
  it('captures committed WAL data and detects logical rows and replay/source artifact changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ott-practice-snapshot-'));
    temporaryRoots.push(root);
    const dataPath = path.join(root, 'data');
    fs.mkdirSync(path.join(dataPath, 'bot-revisions'), { recursive: true });
    fs.mkdirSync(path.join(dataPath, 't-abc'), { recursive: true });
    const databasePath = path.join(dataPath, 'arena.sqlite');
    const db = new Database(databasePath);
    databaseClosers.push(() => { if (db.open) db.close(); });
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version VALUES (4);
      CREATE TABLE bots (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, current_revision_id TEXT);
      CREATE TABLE bot_revisions (
        revision_id TEXT PRIMARY KEY, bot_id TEXT, owner_id TEXT, source_digest TEXT,
        runtime_id TEXT, source_size INTEGER, execution_mode TEXT, sdk_version TEXT, sdk_digest TEXT
      );
      INSERT INTO bots VALUES ('bot-1', 'user-1', 'Bot', 'rev-1');
      INSERT INTO bot_revisions VALUES ('rev-1', 'bot-1', 'user-1', 'digest-1', 'cpp', 10, 'strategy', '1.0.0', 'sdk-digest');
    `);
    fs.writeFileSync(path.join(dataPath, 'bot-revisions', 'rev-1.cpp'), 'source-v1');
    fs.writeFileSync(path.join(dataPath, 't-abc', 'tournament.json'), JSON.stringify({
      rounds: [{ pairings: [{ matchId: 'match-1', status: 'completed', result: { winner: 'A' } }] }],
      standings: [{ rank: 1, participantId: 'participant-1' }],
    }));
    fs.writeFileSync(path.join(dataPath, 't-abc', 'replay.json'), JSON.stringify({ moves: [{ turn: 1, move: 'a1' }] }));
    fs.writeFileSync(path.join(dataPath, 't-abc', 'replay-metadata.json'), JSON.stringify({ integrity: 'sha256:test' }));
    const beforeFiles = fs.readdirSync(dataPath).sort();
    const first = await createLogicalSnapshot({
      repoRoot: process.cwd(), databasePath,
      backupPath: path.join(root, 'before.sqlite'), dataPath,
    });

    expect(first.tables.bot_revisions).toHaveLength(1);
    expect(first.files.map(file => file.path)).toEqual(expect.arrayContaining([
      'bot-revisions/rev-1.cpp', 't-abc/tournament.json', 't-abc/replay.json', 't-abc/replay-metadata.json',
    ]));
    expect(fs.readdirSync(dataPath).sort()).toEqual(beforeFiles);

    db.prepare('UPDATE bot_revisions SET source_digest = ? WHERE revision_id = ?').run('digest-2', 'rev-1');
    db.prepare('DELETE FROM bots WHERE id = ?').run('bot-1');
    fs.writeFileSync(path.join(dataPath, 't-abc', 'tournament.json'), JSON.stringify({
      rounds: [{ pairings: [{ matchId: 'match-1', status: 'failed', result: null }] }],
      standings: [],
    }));
    fs.writeFileSync(path.join(dataPath, 't-abc', 'replay.json'), JSON.stringify({ moves: [{ turn: 1, move: 'i9' }] }));
    fs.writeFileSync(path.join(dataPath, 't-abc', 'standings.json'), JSON.stringify([{ rank: 1, botId: 'bot-1' }]));
    fs.rmSync(path.join(dataPath, 't-abc', 'replay-metadata.json'));
    const second = await createLogicalSnapshot({
      repoRoot: process.cwd(), databasePath,
      backupPath: path.join(root, 'after.sqlite'), dataPath,
    });

    expect(second.sha256).not.toBe(first.sha256);
    expect(second.tables.bots).toHaveLength(0);
    expect(second.tables.bot_revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_digest: 'digest-2' }),
    ]));
    expect(second.files.map(file => file.path)).toContain('t-abc/standings.json');
    expect(second.files.map(file => file.path)).not.toContain('t-abc/replay-metadata.json');
    expect(fs.readdirSync(dataPath).sort()).toEqual(beforeFiles);
    db.close();
  });
});
