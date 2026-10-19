import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export async function readPersistedQaMatch(storageDir, tournamentId, matchId) {
  // This is deliberately a read-only file helper. Opening a repository here
  // would acquire a second SQLite writer while the QA owner is still alive.
  const tournamentDir = path.join(path.resolve(storageDir), tournamentId);
  const [recordData, replayData, commitData] = await Promise.all([
    fs.readFile(path.join(tournamentDir, `match-${matchId}.json`), 'utf8'),
    fs.readFile(path.join(tournamentDir, `replay-${matchId}.json`), 'utf8'),
    fs.readFile(path.join(tournamentDir, `match-${matchId}.commit.json`), 'utf8'),
  ]);
  const record = JSON.parse(recordData);
  const replay = JSON.parse(replayData);
  const commit = JSON.parse(commitData);
  const commitVerified = commit.matchId === matchId
    && commit.resultHash === createHash('sha256').update(recordData).digest('hex')
    && commit.replayHash === createHash('sha256').update(replayData).digest('hex');
  if (!commitVerified) throw new Error(`QA persisted match commit verification failed for ${matchId}`);
  return {
    commitVerified,
    record: {
      winner: record.winner,
      terminationReason: record.terminationReason,
      turnCount: record.turnCount,
      executionDiagnostics: record.executionDiagnostics ?? [],
    },
    replay: {
      winner: replay.winner,
      terminationReason: replay.terminationReason,
      turnErrors: (replay.turnLog ?? []).flatMap(turn => turn.error ? [{
        player: turn.player,
        code: turn.error.code,
        message: turn.error.message,
        diagnostic: turn.executionDiagnostic ?? null,
      }] : []),
    },
    compilerStderrPersisted: false,
  };
}
