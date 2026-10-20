import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = await readFile(new URL('../../js/replay.js', import.meta.url), 'utf8');
const base = 'https://static.example/replays/';

function replay(matchId: string, series?: unknown) {
  return {
    matchId, protocolVersion: '1',
    initialState: { boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [], status: 'in_progress', winner: null, winReason: null, lastMove: null },
    moves: [],
    finalState: { boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [], status: 'finished', winner: 'A', winReason: 'goal_reached', lastMove: null },
    winner: 'A', terminationReason: 'goal_reached',
    ...(series ? { series } : {}),
  };
}

function response(value: unknown, status = 200) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function load(fetchImpl: (url: string) => Promise<unknown>, configuredBase = base) {
  const context: Record<string, unknown> = {
    window: { OTT_PUBLIC_REPLAY_BASE_URL: configuredBase, location: { origin: 'http://localhost:3000' } },
    URL, TextDecoder, TextEncoder, crypto: webcrypto, fetch: fetchImpl,
  };
  vm.runInNewContext(source, context);
  return context.loadPublicReplay as (tournamentId: string, matchId: string, seriesContext?: unknown) => Promise<unknown>;
}

describe('static public replay loading', () => {
  it('loads a valid public payload without a backend session', async () => {
    const value = replay('match-1');
    const replayHash = hash(value);
    const manifest = { schemaVersion: 1, status: 'published', tournamentId: 'tournament-1', entries: [{ matchId: 'match-1', replayHash, sha256: replayHash, path: `tournaments/tournament-1/matches/match-1-${replayHash}.json` }] };
    const loader = load(async url => String(url).endsWith('index.json') ? response(manifest) : response(value));
    await expect(loader('tournament-1', 'match-1')).resolves.toEqual(value);
  });

  it('accepts embedded BO2/BO3 game IDs and preserves swapped sides', async () => {
    const series = {
      format: 'bo2', bestOf: 2, winsA: 1, winsB: 1, winner: 'draw',
      games: [{ gameNumber: 1, matchId: 'game-1', participantA: 'a', participantB: 'b', winner: 'A', winnerParticipantId: 'a', replay: replay('game-1') }, { gameNumber: 2, matchId: 'game-2', participantA: 'b', participantB: 'a', winner: 'A', winnerParticipantId: 'b', replay: replay('game-2') }],
    };
    const value = replay('pairing-1', series);
    const replayHash = hash(value);
    const manifest = { schemaVersion: 1, status: 'published', tournamentId: 'tournament-1', entries: [{ matchId: 'pairing-1', replayHash, sha256: replayHash, path: `tournaments/tournament-1/matches/pairing-1-${replayHash}.json` }] };
    const loader = load(async url => String(url).endsWith('index.json') ? response(manifest) : response(value));
    await expect(loader('tournament-1', 'game-2', { matchId: 'pairing-1' })).resolves.toEqual(value);
  });

  it('treats revoked manifests, invalid hashes and unsafe paths as terminal', async () => {
    const revokedLoader = load(async url => response(String(url).endsWith('index.json') ? { schemaVersion: 1, status: 'revoked', tournamentId: 'tournament-1', entries: [] } : {}, 200));
    await expect(revokedLoader('tournament-1', 'match-1')).rejects.toMatchObject({ publicReplayTerminal: true });
    const invalidLoader = load(async url => response(String(url).endsWith('index.json') ? { schemaVersion: 1, status: 'published', tournamentId: 'tournament-1', entries: [{ matchId: 'match-1', replayHash: 'a'.repeat(64), sha256: 'b'.repeat(64), path: 'tournaments/tournament-1/matches/match-1-' + 'a'.repeat(64) + '.json' }] } : {}));
    await expect(invalidLoader('tournament-1', 'match-1')).rejects.toMatchObject({ publicReplayTerminal: true });
    const unsafeLoader = load(async url => response(String(url).endsWith('index.json') ? { schemaVersion: 1, status: 'published', tournamentId: 'tournament-1', entries: [{ matchId: 'match-1', replayHash: 'a'.repeat(64), sha256: 'a'.repeat(64), path: 'https://evil.example/replay.json' }] } : {}));
    await expect(unsafeLoader('tournament-1', 'match-1')).rejects.toMatchObject({ publicReplayTerminal: true });
  });

  it('treats missing static files as recoverable for authorized API fallback', async () => {
    const loader = load(async url => response(String(url).endsWith('index.json') ? { schemaVersion: 1, status: 'published', tournamentId: 'tournament-1', entries: [{ matchId: 'match-1', replayHash: 'a'.repeat(64), sha256: 'a'.repeat(64), path: 'tournaments/tournament-1/matches/match-1-' + 'a'.repeat(64) + '.json' }] } : {}, 404));
    await expect(loader('tournament-1', 'match-1')).rejects.toMatchObject({ publicReplayRecoverable: true });
    expect(source.indexOf('if (!await ensureReplaySession())') > source.indexOf('loadPublicReplay(tournamentId, matchId, seriesContext)')).toBe(true);
  });
});
