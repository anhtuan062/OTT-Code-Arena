const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

async function createLogicalSnapshot({ repoRoot, databasePath, backupPath, dataPath }) {
  const root = path.resolve(repoRoot);
  const dataRoot = path.resolve(dataPath);
  const Database = createRequire(path.join(root, 'package.json'))('better-sqlite3');
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    // SQLite's online backup API incorporates committed WAL pages without
    // hashing a changing main database file or checkpointing the live DB.
    await source.backup(backupPath);
  } finally {
    source.close();
  }

  const snapshotDb = new Database(backupPath, { readonly: true, fileMustExist: true });
  let tables;
  try {
    tables = {
      schema_version: snapshotDb.prepare('SELECT version FROM schema_version ORDER BY version').all(),
      bots: snapshotDb.prepare('SELECT id, owner_id, name, current_revision_id FROM bots ORDER BY id').all(),
      bot_revisions: snapshotDb.prepare(`
        SELECT revision_id, bot_id, owner_id, source_digest, runtime_id, source_size,
               execution_mode, sdk_version, sdk_digest
        FROM bot_revisions ORDER BY revision_id
      `).all(),
    };
  } finally {
    snapshotDb.close();
  }

  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.source-execution' || entry.name.startsWith('.tournament-owner.sqlite')) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && !/^arena\.sqlite(?:-wal|-shm)?$/i.test(entry.name)) {
        const bytes = fs.readFileSync(fullPath);
        const record = {
          path: path.relative(dataRoot, fullPath).replace(/\\/g, '/'),
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
        if (/\.json$/i.test(entry.name)) {
          try {
            const canonical = JSON.stringify(JSON.parse(bytes.toString('utf8')));
            record.logicalJsonSha256 = crypto.createHash('sha256').update(canonical).digest('hex');
          } catch {
            record.logicalJsonSha256 = 'invalid-json';
          }
        }
        files.push(record);
      }
    }
  }
  visit(dataRoot);
  files.sort((left, right) => left.path.localeCompare(right.path));

  const snapshot = { tables, files };
  snapshot.sha256 = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return snapshot;
}

module.exports = { createLogicalSnapshot };

if (require.main === module) {
  const [repoRoot, databasePath, backupPath, dataPath] = process.argv.slice(2);
  if (![repoRoot, databasePath, backupPath, dataPath].every(Boolean)) {
    console.error('Usage: phase8.5c-logical-snapshot.cjs <repoRoot> <databasePath> <backupPath> <dataPath>');
    process.exitCode = 2;
  } else {
    createLogicalSnapshot({ repoRoot, databasePath, backupPath, dataPath })
      .then(snapshot => process.stdout.write(JSON.stringify(snapshot)))
      .catch(error => {
        console.error(String(error && error.message || error).slice(0, 600));
        process.exitCode = 1;
      });
  }
}
