import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileTournamentRepository } from '../../tournament/persistence.js';
import { applicationMetrics } from '../../observability/metrics.js';

describe('persisted replay read cache', () => {
  const repositories: FileTournamentRepository[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const repository of repositories.splice(0)) repository.close?.();
    for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
  });

  function metric(name: string): number {
    return applicationMetrics.snapshot().counters[name] ?? 0;
  }

  async function fixture() {
    const dir = path.join(os.tmpdir(), `ott-replay-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
    dirs.push(dir);
    const repository = new FileTournamentRepository({ baseDir: dir });
    repositories.push(repository);
    const tournamentId = 't-cache';
    const matchId = 'm-cache';
    const result = {
      matchId,
      replayRef: matchId,
      pairingId: 'p-cache',
      participantA: 'bot-a',
      participantB: 'bot-b',
      winner: 'A',
      completedAt: new Date().toISOString(),
    } as any;
    const replay = { matchId, format: 'bo1', games: [{ gameNumber: 1, winner: 'A', moves: [] }] };
    await repository.saveMatchResult(tournamentId, matchId, result, replay);
    return { dir, repository, tournamentId, matchId, result, replay };
  }

  it('caches validated reads and single-flights concurrent misses', async () => {
    const { repository, tournamentId, matchId } = await fixture();
    const beforeReads = metric('replay.persistence_reads');
    const beforeHits = metric('cache.replay.hits');
    const beforeFlights = metric('cache.replay.singleflight');

    const values = await Promise.all(Array.from({ length: 20 }, () => repository.loadReplay(tournamentId, matchId)));

    expect(values.every(value => value?.matchId === matchId)).toBe(true);
    expect(metric('replay.persistence_reads') - beforeReads).toBe(1);
    expect(metric('cache.replay.singleflight') - beforeFlights).toBeGreaterThanOrEqual(1);

    await repository.loadReplay(tournamentId, matchId);
    expect(metric('cache.replay.hits') - beforeHits).toBeGreaterThanOrEqual(1);
  });

  it('invalidates the versioned entry when an immutable result is replaced', async () => {
    const { repository, tournamentId, matchId, result } = await fixture();
    const first = await repository.loadReplay(tournamentId, matchId);
    const replacement = { ...result, completedAt: new Date(Date.now() + 1_000).toISOString() };
    const nextReplay = { matchId, format: 'bo1', games: [{ gameNumber: 1, winner: 'B', moves: [] }] };
    await repository.saveMatchResult(tournamentId, matchId, replacement, nextReplay);

    const second = await repository.loadReplay(tournamentId, matchId);
    expect(first?.games?.[0]?.winner).toBe('A');
    expect(second?.games?.[0]?.winner).toBe('B');
  });

  it('does not cache corrupt persisted replay data and reads it after restart', async () => {
    const { dir, repository, tournamentId, matchId } = await fixture();
    await repository.loadReplay(tournamentId, matchId);
    await fs.writeFile(path.join(dir, tournamentId, `replay-${matchId}.json`), '{corrupt', 'utf8');
    await expect(repository.loadReplay(tournamentId, matchId)).rejects.toThrow(/Unexpected token|JSON/);

    repository.close?.();
    const restarted = new FileTournamentRepository({ baseDir: dir });
    repositories.push(restarted);
    await expect(restarted.loadReplay(tournamentId, matchId)).rejects.toThrow(/Unexpected token|JSON/);
  });
});
