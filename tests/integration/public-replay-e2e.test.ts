import { createHash, webcrypto } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { FileTournamentRepository, createTournament } from '../../tournament/persistence.js';
import { PublicReplayExporter } from '../../server/public-replay-exporter.js';

const replaySource = await fs.readFile(new URL('../../js/replay.js', import.meta.url), 'utf8');
const publicBase = 'https://qa-static.example/replays/';
const resources: Array<{ repo: FileTournamentRepository; root: string }> = [];

function state(winner: 'A' | 'B' | null = null) {
  return { boardSize: 9, currentPlayer: 'A' as const, turn: 1, pieces: [], status: 'finished' as const, winner, winReason: winner ? 'goal_reached' as const : null, lastMove: null };
}

function responseBytes(bytes: Buffer, status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

function diskFetch(output: string) {
  return async (input: string | URL) => {
    const url = new URL(String(input));
    const relative = url.pathname.replace('/replays/', '');
    const file = path.join(output, relative);
    try { return responseBytes(await fs.readFile(file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return responseBytes(Buffer.from('{}'), 404); throw error; }
  };
}

function frontendFunctions(fetchImpl: (input: string | URL) => Promise<unknown>, session = async () => false, api = async () => { throw new Error('unexpected API call'); }) {
  const context: Record<string, unknown> = {
    window: { OTT_PUBLIC_REPLAY_BASE_URL: publicBase, location: { origin: 'http://localhost:3000' } },
    URL, TextDecoder, TextEncoder, crypto: webcrypto, fetch: fetchImpl,
    ensureReplaySession: session, api, state: { spectatorMode: false },
  };
  vm.runInNewContext(replaySource, context);
  return {
    loadPublicReplay: context.loadPublicReplay as (tournamentId: string, matchId: string, seriesContext?: unknown) => Promise<any>,
    loadWithFallback: context.loadReplayWithAuthorizedFallback as (tournamentId: string, matchId: string, seriesContext?: unknown) => Promise<any>,
    availableSeriesReplayIndexes: context.availableSeriesReplayIndexes as (replay: unknown) => number[],
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-replay-e2e-'));
  const repo = new FileTournamentRepository({ baseDir: path.join(root, 'tournaments'), indent: 2 });
  await repo.initialize();
  const tournament = createTournament('tournament-qa', 'Published QA tournament');
  tournament.status = 'completed';
  tournament.resultsPublishedAt = new Date().toISOString();
  tournament.metadata = { ownerId: 'organizer-qa', access: 'private' };
  tournament.participants = [
    { participantId: 'participant-a', name: 'Alice QA', bot: { botId: 'bot-a', command: 'node', args: [] }, registeredAt: new Date().toISOString() },
    { participantId: 'participant-b', name: 'Bob QA', bot: { botId: 'bot-b', command: 'node', args: [] }, registeredAt: new Date().toISOString() },
  ];
  tournament.rounds = [{ roundNumber: 1, pairings: [{ pairingId: 'pairing-qa', roundNumber: 1, participantA: 'participant-a', participantB: 'participant-b', status: 'scheduled', matchId: null, matchResult: null, startedAt: null, completedAt: null }] }];
  await repo.save(tournament);
  const completedAt = new Date().toISOString();
  const game = (matchId: string, participantA: string, participantB: string, winnerParticipantId: string) => ({
    gameNumber: Number(matchId.endsWith('1') ? 1 : 2) as 1 | 2,
    matchId, participantA, participantB, winner: 'A' as const, winnerParticipantId,
    replay: { matchId, protocolVersion: '0.1.0', initialState: state(), moves: [], finalState: state('A'), winner: 'A' as const, terminationReason: 'goal_reached' as const, participantIdentities: { A: { participantId: 'spoofed', participantName: 'private' }, B: { participantId: 'spoofed-b', participantName: 'private' } }, metadata: { executionDiagnostics: ['private'], sourceRevisions: ['private'] } },
  });
  const matchId = 'pairing-match-qa';
  const result = { matchId, pairingId: 'pairing-qa', participantA: 'participant-a', participantB: 'participant-b', winner: 'A' as const, terminationReason: 'goal_reached' as const, turnCount: 2, durationMs: 2, replayRef: matchId, completedAt, series: { format: 'bo2' as const, bestOf: 2 as const, seed: 'qa-seed', games: [{ gameNumber: 1 as const, matchId: 'pairing-game-1', participantA: 'participant-a', participantB: 'participant-b', winner: 'A' as const, winnerParticipantId: 'participant-a', terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 1, replayRef: 'pairing-game-1', completedAt }, { gameNumber: 2 as const, matchId: 'pairing-game-2', participantA: 'participant-b', participantB: 'participant-a', winner: 'A' as const, winnerParticipantId: 'participant-b', terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 1, replayRef: 'pairing-game-2', completedAt }], winsA: 1, winsB: 1, winner: 'draw' as const } };
  const replay = { matchId, protocolVersion: '0.1.0', initialState: state(), moves: [], finalState: state('A'), winner: 'A' as const, terminationReason: 'goal_reached' as const, participantIdentities: { A: { participantId: 'private', participantName: 'private', botId: 'secret' }, B: { participantId: 'private-b', participantName: 'private' } }, metadata: { executionDiagnostics: ['private'], sourceRevisions: ['private'] }, series: { format: 'bo2' as const, bestOf: 2 as const, seed: 'secret', winsA: 1, winsB: 1, winner: 'draw' as const, games: [game('pairing-game-1', 'participant-a', 'participant-b', 'participant-a'), game('pairing-game-2', 'participant-b', 'participant-a', 'participant-b')] } };
  await repo.saveMatchResult('tournament-qa', matchId, result as never, replay);
  const saved = (await repo.load('tournament-qa'))!;
  const pairing = saved.rounds[0]!.pairings[0]!;
  pairing.status = 'completed'; pairing.matchId = matchId; pairing.completedAt = completedAt; pairing.matchResult = result as never;
  await repo.save(saved);
  resources.push({ repo, root });
  const output = path.join(root, 'public');
  const manifest = await new PublicReplayExporter(repo, output).exportTournament('tournament-qa', { id: 'organizer-qa', role: 'organizer' });
  return { repo, root, output, manifest, matchId };
}

afterEach(async () => {
  for (const resource of resources.splice(0)) { resource.repo.close(); await fs.rm(resource.root, { recursive: true, force: true }); }
});

describe('PublicReplayExporter + Static Replay Visualizer E2E', () => {
  it('exports and loads real sanitized BO2 data with manifest/hash/control compatibility', async () => {
    const fixtureData = await fixture();
    const functions = frontendFunctions(diskFetch(fixtureData.output));
    const replay = await functions.loadPublicReplay('tournament-qa', 'pairing-game-2', { matchId: fixtureData.matchId });
    const index = await fs.readFile(path.join(fixtureData.output, 'tournaments/tournament-qa/index.json'), 'utf8');
    const manifest = JSON.parse(index);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.status).toBe('published');
    expect(replay.matchId).toBe(fixtureData.matchId);
    expect(replay.participantIdentities.A).toEqual({ participantId: 'participant-a', participantName: 'Alice QA' });
    expect(replay.series.games[1].participantA).toBe('participant-b');
    expect(replay.series.games[1].replay.participantIdentities.A).toEqual({ participantId: 'participant-b', participantName: 'Bob QA' });
    expect(functions.availableSeriesReplayIndexes(replay)).toEqual([0, 1]);
    const publicText = await fs.readFile(path.join(fixtureData.output, manifest.entries[0].path), 'utf8');
    expect(publicText).not.toContain('private');
    expect(publicText).not.toContain('secret');
  });

  it('fails closed for revoked and corrupted static artifacts', async () => {
    const fixtureData = await fixture();
    const exporter = new PublicReplayExporter(fixtureData.repo, fixtureData.output);
    await exporter.revokeTournament('tournament-qa', { id: 'organizer-qa', role: 'organizer' });
    const revoked = frontendFunctions(diskFetch(fixtureData.output));
    await expect(revoked.loadPublicReplay('tournament-qa', fixtureData.matchId)).rejects.toMatchObject({ publicReplayTerminal: true });

    const restored = await fixture();
    const replayPath = path.join(restored.output, restored.manifest.entries[0].path);
    await fs.writeFile(replayPath, '{"matchId":"tampered"}');
    const corrupted = frontendFunctions(diskFetch(restored.output));
    await expect(corrupted.loadPublicReplay('tournament-qa', restored.matchId)).rejects.toMatchObject({ publicReplayTerminal: true });
  });

  it('uses the authenticated API only for a recoverable missing static artifact', async () => {
    const fixtureData = await fixture();
    await fs.rm(path.join(fixtureData.output, fixtureData.manifest.entries[0].path));
    const apiReplay = { matchId: fixtureData.matchId, initialState: state(), moves: [], finalState: state('A') };
    let apiCalls = 0;
    const functions = frontendFunctions(diskFetch(fixtureData.output), async () => true, async endpoint => { apiCalls++; expect(endpoint).toContain(`/tournaments/tournament-qa/replays/${fixtureData.matchId}`); return apiReplay; });
    await expect(functions.loadWithFallback('tournament-qa', fixtureData.matchId)).resolves.toEqual(apiReplay);
    expect(apiCalls).toBe(1);

    const unauthorized = frontendFunctions(diskFetch(fixtureData.output), async () => false);
    await expect(unauthorized.loadWithFallback('tournament-qa', fixtureData.matchId)).rejects.toMatchObject({ publicReplayRecoverable: true });
  });
});
