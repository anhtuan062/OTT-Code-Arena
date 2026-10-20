import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileTournamentRepository, createTournament } from '../../tournament/persistence.js';
import { PublicReplayExporter } from '../../server/public-replay-exporter.js';

describe('PublicReplayExporter', () => {
  const resources: Array<{ repo: FileTournamentRepository; root: string }> = [];
  afterEach(async () => {
    for (const resource of resources.splice(0)) {
      resource.repo.close();
      await fs.rm(resource.root, { recursive: true, force: true });
    }
  });

  const state = (winner: 'A' | 'B' | null = null) => ({
    boardSize: 3, currentPlayer: 'A' as const, turn: 1, pieces: [], status: 'finished' as const,
    winner, winReason: winner ? 'goal_reached' as const : null, lastMove: null,
  });

  async function fixture(options: { published?: boolean; withPairing?: boolean; ownerId?: string } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-replay-'));
    const output = path.join(root, 'public');
    const repo = new FileTournamentRepository({ baseDir: path.join(root, 'tournaments'), indent: 2 });
    await repo.initialize();
    const tournament = createTournament('tournament-1', 'Public tournament');
    tournament.status = options.published ? 'completed' : 'running';
    tournament.resultsPublishedAt = options.published ? new Date().toISOString() : null;
    tournament.metadata = { ownerId: options.ownerId ?? 'organizer-1', access: 'private' };
    tournament.participants = [
      { participantId: 'a', name: 'Alice', bot: { botId: 'bot-a', command: 'node', args: [] }, registeredAt: new Date().toISOString() },
      { participantId: 'b', name: 'Bob', bot: { botId: 'bot-b', command: 'node', args: [] }, registeredAt: new Date().toISOString() },
    ];
    if (options.withPairing) tournament.rounds = [{ roundNumber: 1, pairings: [{
      pairingId: 'pairing-1', roundNumber: 1, participantA: 'a', participantB: 'b', status: 'scheduled', matchId: null,
      matchResult: null, startedAt: null, completedAt: null,
    }] }];
    await repo.save(tournament);
    resources.push({ repo, root });
    return { repo, output, tournamentDir: path.join(root, 'tournaments', 'tournament-1') };
  }

  async function addReplay(repo: FileTournamentRepository, matchId = 'match-1', series = false) {
    const completedAt = new Date().toISOString();
    const result = {
      matchId, pairingId: 'pairing-1', participantA: 'a', participantB: 'b', winner: 'A' as const,
      terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 1, replayRef: matchId, completedAt,
      ...(series ? { series: { format: 'bo2' as const, bestOf: 2 as const, seed: 'seed-1', winsA: 1, winsB: 0, winner: 'A' as const, games: [{
        gameNumber: 1 as const, matchId: 'game-1', participantA: 'a', participantB: 'b', winner: 'A' as const, winnerParticipantId: 'a',
        terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 1, replayRef: 'game-1', completedAt,
      }, { gameNumber: 2 as const, matchId: 'game-2', participantA: 'b', participantB: 'a', winner: 'A' as const, winnerParticipantId: 'b', terminationReason: 'goal_reached' as const, turnCount: 1, durationMs: 1, replayRef: 'game-2', completedAt }] } } : {}),
    };
    const gameReplay = (gameId: string, a: string, b: string) => ({
      matchId: gameId, protocolVersion: '1', initialState: state(), moves: [], finalState: state('A'), winner: 'A' as const,
      terminationReason: 'goal_reached' as const, participantIdentities: { A: { participantId: a, participantName: 'wrong' }, B: { participantId: b, participantName: 'wrong' } },
    });
    const replay = {
      matchId, protocolVersion: '1', initialState: state(), moves: [], finalState: state('A'), winner: 'A' as const, terminationReason: 'goal_reached' as const,
      participantIdentities: { A: { participantId: 'a', participantName: 'wrong', botId: 'secret' }, B: { participantId: 'b', participantName: 'wrong' } },
      metadata: { executionDiagnostics: ['private'], sourceRevisions: ['private'] },
      ...(series ? { series: { format: 'bo2' as const, bestOf: 2 as const, seed: 'secret-seed', winsA: 1, winsB: 0, winner: 'A' as const, games: [{ gameNumber: 1 as const, participantA: 'a', participantB: 'b', winner: 'A' as const, winnerParticipantId: 'a', replay: gameReplay('game-1', 'a', 'b') }, { gameNumber: 2 as const, participantA: 'b', participantB: 'a', winner: 'A' as const, winnerParticipantId: 'b', replay: gameReplay('game-2', 'b', 'a') }] } } : {}),
    };
    await repo.saveMatchResult('tournament-1', matchId, result as never, replay);
    const tournament = (await repo.load('tournament-1'))!;
    const pairing = tournament.rounds[0]?.pairings[0];
    if (pairing) {
      pairing.status = 'completed'; pairing.matchId = matchId; pairing.completedAt = completedAt; pairing.matchResult = result as never;
      await repo.save(tournament);
    }
  }

  it('rejects unpublished, unauthorized, invalid and orphaned exports', async () => {
    const unpublished = await fixture();
    await expect(new PublicReplayExporter(unpublished.repo, unpublished.output).exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'unpublished' });
    const published = await fixture({ published: true, withPairing: true });
    await addReplay(published.repo);
    await expect(new PublicReplayExporter(published.repo, published.output).exportTournament('tournament-1', { id: 'other', role: 'organizer' })).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(new PublicReplayExporter(published.repo, published.output).exportTournament('../bad', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'invalid' });
    const orphan = await fixture({ published: true });
    await addReplay(orphan.repo);
    await expect(new PublicReplayExporter(orphan.repo, orphan.output).exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'integrity' });
  });

  it('uses explicit public fields, correct swapped series identities and payload hashes', async () => {
    const { repo, output } = await fixture({ published: true, withPairing: true });
    await addReplay(repo, 'match-1', true);
    const manifest = await new PublicReplayExporter(repo, output).exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' });
    const entry = manifest.entries[0]!;
    const bytes = await fs.readFile(path.join(output, entry.path));
    expect(entry.replayHash).toBe(entry.sha256);
    expect(entry.path).toContain(`${entry.replayHash}.json`);
    expect(entry.replayHash).toBe((await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'));
    const replay = JSON.parse(bytes.toString()) as Record<string, unknown>;
    expect(replay).not.toHaveProperty('metadata');
    expect(JSON.stringify(replay)).not.toContain('secret');
    expect((replay.participantIdentities as any).A).toEqual({ participantId: 'a', participantName: 'Alice' });
    expect(((replay.series as any).games[1].replay.participantIdentities).A).toEqual({ participantId: 'b', participantName: 'Bob' });
    expect(replay).toHaveProperty('series');
  });

  it('supports empty manifests, concurrent idempotent exports and atomic re-export', async () => {
    const empty = await fixture({ published: true });
    const emptyExporter = new PublicReplayExporter(empty.repo, empty.output);
    const emptyManifest = await emptyExporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' });
    expect(emptyManifest.entries).toEqual([]);
    await expect(fs.access(path.join(empty.output, 'tournaments/tournament-1/index.json'))).resolves.toBeUndefined();

    const { repo, output } = await fixture({ published: true, withPairing: true });
    await addReplay(repo);
    const exporter = new PublicReplayExporter(repo, output);
    const [first, second] = await Promise.all([
      exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' }),
      exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' }),
    ]);
    expect(second).toEqual(first);
    const indexPath = path.join(output, 'tournaments/tournament-1/index.json');
    const before = await fs.readFile(indexPath, 'utf8');
    expect(await fs.readFile(indexPath, 'utf8')).toBe(before);
  });

  it('rejects a symlinked export directory instead of following it', async () => {
    const { repo, output } = await fixture({ published: true, withPairing: true });
    await addReplay(repo);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-public-replay-outside-'));
    try {
      await fs.mkdir(output, { recursive: true });
      await fs.symlink(outside, path.join(output, 'tournaments'), 'junction');
      await expect(new PublicReplayExporter(repo, output).exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'integrity' });
      expect((await fs.readdir(outside))).toEqual([]);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EINVAL'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('preserves the prior manifest after a partial integrity failure and supports revocation', async () => {
    const { repo, output, tournamentDir } = await fixture({ published: true, withPairing: true });
    await addReplay(repo);
    const exporter = new PublicReplayExporter(repo, output);
    const valid = await exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' });
    const indexPath = path.join(output, 'tournaments/tournament-1/index.json');
    const before = await fs.readFile(indexPath, 'utf8');
    await fs.rm(path.join(tournamentDir, 'match-match-1.commit.json'));
    await expect(exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'integrity' });
    expect(await fs.readFile(indexPath, 'utf8')).toBe(before);
    await fs.writeFile(path.join(tournamentDir, 'match-match-1.commit.json'), JSON.stringify({ matchId: 'match-1', resultHash: '0'.repeat(64), replayHash: 'invalid' }));
    await expect(exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'integrity' });
    expect(await fs.readFile(indexPath, 'utf8')).toBe(before);
    const revoked = await exporter.revokeTournament('tournament-1', { id: 'organizer-1', role: 'organizer' });
    expect(revoked.status).toBe('revoked');
    expect(JSON.parse(await fs.readFile(indexPath, 'utf8')).entries).toEqual([]);
    expect(valid.entries).toHaveLength(1);
    const tournament = (await repo.load('tournament-1'))!;
    tournament.status = 'running'; tournament.resultsPublishedAt = null;
    await repo.save(tournament);
    await expect(exporter.exportTournament('tournament-1', { id: 'organizer-1', role: 'organizer' })).rejects.toMatchObject({ code: 'unpublished' });
    expect(JSON.parse(await fs.readFile(indexPath, 'utf8')).status).toBe('revoked');
  });
});
