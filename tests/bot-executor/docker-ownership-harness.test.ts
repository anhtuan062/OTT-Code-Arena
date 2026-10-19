import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../scripts/docker-ownership-args.mjs';
import { readPersistedQaMatch } from '../../scripts/docker-ownership-persistence-reader.mjs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

describe('Docker ownership E2E harness CLI contract', () => {
  it('forwards boolean mode flags without shifting following key/value arguments', () => {
    const parsed = parseCliArgs([
      '--owner', '--initialize', 'true', '--gate', 'true',
      '--storage-dir', 'qa-storage-a', '--work-dir', 'qa-work-a',
      '--namespace', 'qa-namespace-a', '--tournament', 'qa-tournament-a', '--instance', 'owner-a',
    ]);
    expect(parsed.get('--owner')).toBe('true');
    expect(parsed.get('--initialize')).toBe('true');
    expect(parsed.get('--gate')).toBe('true');
    expect(parsed.get('--storage-dir')).toBe('qa-storage-a');
    expect(parsed.get('--work-dir')).toBe('qa-work-a');
    expect(parsed.get('--namespace')).toBe('qa-namespace-a');
    expect(parsed.get('--tournament')).toBe('qa-tournament-a');
    expect(parsed.get('--instance')).toBe('owner-a');
  });

  it('treats --gate as standalone boolean flag when value is omitted', () => {
    const parsed = parseCliArgs([
      '--owner', '--gate',
      '--storage-dir', 'qa-storage-a', '--work-dir', 'qa-work-a',
      '--namespace', 'qa-namespace-a', '--tournament', 'qa-tournament-a', '--instance', 'owner-a',
    ]);
    expect(parsed.get('--gate')).toBe('true');
    expect(parsed.get('--instance')).toBe('owner-a');
  });

  it('rejects a missing value instead of spawning a malformed owner process', () => {
    expect(() => parseCliArgs(['--owner', '--storage-dir'])).toThrow('Missing value for --storage-dir');
  });

  it('reads committed QA results without acquiring a duplicate storage owner', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-qa-reader-'));
    const tournamentDir = path.join(root, 'qa-tournament');
    await fs.mkdir(tournamentDir, { recursive: true });
    const record = JSON.stringify({ winner: 'A', terminationReason: 'goal_reached', turnCount: 1, executionDiagnostics: [] });
    const replay = JSON.stringify({ winner: 'A', terminationReason: 'goal_reached', turnLog: [] });
    const matchId = 'match-1';
    const commit = JSON.stringify({
      matchId,
      resultHash: createHash('sha256').update(record).digest('hex'),
      replayHash: createHash('sha256').update(replay).digest('hex'),
    });
    await fs.writeFile(path.join(tournamentDir, `match-${matchId}.json`), record);
    await fs.writeFile(path.join(tournamentDir, `replay-${matchId}.json`), replay);
    await fs.writeFile(path.join(tournamentDir, `match-${matchId}.commit.json`), commit);
    await expect(readPersistedQaMatch(root, 'qa-tournament', matchId)).resolves.toMatchObject({
      commitVerified: true, record: { winner: 'A' }, replay: { winner: 'A' },
    });
    await fs.rm(root, { recursive: true, force: true });
  });
});
