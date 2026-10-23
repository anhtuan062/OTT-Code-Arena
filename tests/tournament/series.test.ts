import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TournamentManager } from '@tournament/manager.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import type { MatchExecutor } from '@tournament/executor.js';
import type { MatchResult, MatchReplay } from '@match-runner/types.js';
import type { Tournament, TournamentMatchRecord } from '@tournament/types.js';
import { getSeriesSides, shouldPlayNextGame } from '@tournament/series.js';

class CrashAfterFirstSeriesGameRepository extends FileTournamentRepository {
  private failNextTournamentSave = false;
  private injected = false;

  override async saveMatchResult(
    tournamentId: string,
    matchId: string,
    match: TournamentMatchRecord,
    replay: MatchReplay,
  ): Promise<void> {
    await super.saveMatchResult(tournamentId, matchId, match, replay);
    if (!this.injected && matchId.endsWith('-g1')) {
      this.injected = true;
      this.failNextTournamentSave = true;
    }
  }

  override async save(tournament: Tournament): Promise<void> {
    if (this.failNextTournamentSave) {
      this.failNextTournamentSave = false;
      throw new Error('injected crash after durable series game');
    }
    await super.save(tournament);
  }
}

function result(matchId: string, winner: 'A' | 'B' | 'draw'): MatchResult {
  return {
    matchId, protocolVersion: '0.1.0', status: 'finished', winner,
    terminationReason: winner === 'draw' ? 'repetition' : 'goal_reached', turnCount: 2,
    startTime: new Date(0).toISOString(), endTime: new Date(1).toISOString(), durationMs: 1,
    playerA: { botId: 'bot-a', player: 'A', command: 'node', args: [] },
    playerB: { botId: 'bot-b', player: 'B', command: 'node', args: [] },
    initialState: { boardSize: 9, currentPlayer: 'A', turn: 1, pieces: [], status: 'playing', winner: null, winReason: null, lastMove: null },
    finalState: { boardSize: 9, currentPlayer: 'A', turn: 2, pieces: [], status: 'finished', winner: winner === 'draw' ? null : winner, winReason: winner === 'draw' ? 'repetition' : 'goal_reached', lastMove: null },
    turnLog: [],
  };
}

describe('BO3 tournament series', () => {
  let dir: string;
  let repository: FileTournamentRepository;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-bo3-'));
    repository = new FileTournamentRepository({ baseDir: dir });
    await repository.initialize();
  });

  afterEach(async () => {
    repository.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('keeps both deterministic Game 3 orientations stable when the persisted seed is reloaded', () => {
    const orientations = new Map<string, string>();
    for (let index = 0; index < 10_000 && orientations.size < 2; index += 1) {
      const seed = `game-3-seed-${index}`;
      const first = getSeriesSides(seed, 3, 'P1', 'P2');
      const reloadedSeed = JSON.parse(JSON.stringify({ seed })).seed as string;
      const afterRestart = getSeriesSides(reloadedSeed, 3, 'P1', 'P2');
      expect(afterRestart).toEqual(first);
      orientations.set(`${first.playerA}:${first.playerB}`, seed);
    }

    expect(orientations.has('P1:P2')).toBe(true);
    expect(orientations.has('P2:P1')).toBe(true);
  });

  it('ends after the first two games when their aggregate result is already decided', () => {
    const game = (winnerParticipantId: string | null, participantA = 'P1', participantB = 'P2') => ({
      participantA,
      participantB,
      winnerParticipantId,
    }) as any;

    expect(shouldPlayNextGame([game('P1'), game(null)])).toBe(false);
    expect(shouldPlayNextGame([game('P1'), game('P2')])).toBe(true);
    expect(shouldPlayNextGame([game(null), game(null)])).toBe(true);
  });

  it('plays both sides, stores the seed and keeps standings at one series', async () => {
    const calls: string[] = [];
    const executor: MatchExecutor = {
      async executeMatch(matchId, playerA, playerB) {
        calls.push(`${matchId}:${playerA.botId}:${playerB.botId}`);
        return result(matchId, matchId.endsWith('-g1') ? 'A' : matchId.endsWith('-g2') ? 'A' : 'draw');
      },
      async isAvailable() { return true; },
    };
    const manager = new TournamentManager({ repository, executor, defaultMatchConfig: { bestOf: 3 } });
    await manager.createTournament('bo3', 'BO3', 'single_round_robin');
    await manager.registerParticipant('bo3', 'P1', 'Player 1', { botId: 'B1', command: 'node', args: [] });
    await manager.registerParticipant('bo3', 'P2', 'Player 2', { botId: 'B2', command: 'node', args: [] });
    await manager.openRegistration('bo3');
    await manager.generateSchedule('bo3');
    await manager.startTournament('bo3');

    const run = await manager.runAllMatches('bo3');
    expect(run.success).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain(':B1:B2');
    expect(calls[1]).toContain(':B2:B1');

    const tournament = (await manager.loadTournament('bo3')).data!;
    const pairing = tournament.rounds[0]!.pairings[0]!;
    expect(pairing.status).toBe('completed');
    expect(pairing.matchResult?.series).toMatchObject({ format: 'bo3', bestOf: 3, winsA: 1, winsB: 1, winner: 'draw' });
    expect(pairing.matchResult?.series?.games).toHaveLength(3);
    expect((await repository.listMatchResults('bo3'))).toHaveLength(1);
    const replay = await manager.getReplay('bo3', pairing.matchId!);
    expect(replay.data?.series?.games).toHaveLength(3);
    expect(replay.data?.series?.seed).toBe(pairing.matchResult?.series?.seed);
    const secondGameId = pairing.matchResult?.series?.games[1]?.matchId;
    expect(secondGameId).toBeTruthy();
    const secondGameReplay = await manager.getReplay('bo3', secondGameId!);
    expect(secondGameReplay.data?.participantIdentities).toMatchObject({
      A: { participantId: 'P1', participantName: 'Player 1' },
      B: { participantId: 'P2', participantName: 'Player 2' },
    });
    expect(secondGameReplay.data?.series?.winsA).toBe(1);
    expect(secondGameReplay.data?.series?.winsB).toBe(1);
    expect(tournament.standings.every(standing => standing.matchesPlayed === 1 && standing.draws === 1)).toBe(true);
    expect(tournament.standings.every(standing => standing.points === 1)).toBe(true);
  }, 20_000);

  it('stops after the second series win', async () => {
    const calls: string[] = [];
    const executor: MatchExecutor = {
      async executeMatch(matchId) {
        calls.push(matchId);
        return result(matchId, matchId.endsWith('-g2') ? 'B' : 'A');
      },
      async isAvailable() { return true; },
    };
    const manager = new TournamentManager({ repository, executor, defaultMatchConfig: { bestOf: 3 } });
    await manager.createTournament('bo3-stop', 'BO3 stop', 'single_round_robin');
    await manager.registerParticipant('bo3-stop', 'P1', 'Player 1', { botId: 'B1', command: 'node', args: [] });
    await manager.registerParticipant('bo3-stop', 'P2', 'Player 2', { botId: 'B2', command: 'node', args: [] });
    await manager.openRegistration('bo3-stop');
    await manager.generateSchedule('bo3-stop');
    await manager.startTournament('bo3-stop');
    expect((await manager.runAllMatches('bo3-stop')).success).toBe(true);
    expect(calls).toHaveLength(2);
    const tournament = (await manager.loadTournament('bo3-stop')).data!;
    expect(tournament.standings.find(standing => standing.participantId === 'P1')).toMatchObject({ wins: 1, losses: 0, points: 3 });
    expect(tournament.standings.find(standing => standing.participantId === 'P2')).toMatchObject({ wins: 0, losses: 1, points: 0 });
  });

  it('plays exactly two alternating games for BO2 and keeps the scheduler on the series path', async () => {
    const calls: string[] = [];
    const executor: MatchExecutor = {
      async executeMatch(matchId, playerA, playerB) {
        calls.push(`${matchId}:${playerA.botId}:${playerB.botId}`);
        return result(matchId, 'A');
      },
      async isAvailable() { return true; },
    };
    const manager = new TournamentManager({
      repository,
      executor,
      defaultMatchConfig: { bestOf: 2 },
      enableBo1MatchScheduler: true,
    });
    await manager.createTournament('bo2', 'BO2', 'single_round_robin');
    await manager.registerParticipant('bo2', 'P1', 'Player 1', { botId: 'B1', command: 'node', args: [] });
    await manager.registerParticipant('bo2', 'P2', 'Player 2', { botId: 'B2', command: 'node', args: [] });
    await manager.openRegistration('bo2');
    await manager.generateSchedule('bo2');
    await manager.startTournament('bo2');

    const run = await manager.runAllMatches('bo2');
    expect(run.success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(':B1:B2');
    expect(calls[1]).toContain(':B2:B1');
    const tournament = (await manager.loadTournament('bo2')).data!;
    const pairing = tournament.rounds[0]!.pairings[0]!;
    expect(pairing.matchResult?.series).toMatchObject({ format: 'bo2', bestOf: 2, winsA: 1, winsB: 1, winner: 'draw' });
    expect(tournament.standings.find(standing => standing.participantId === 'P1')).toMatchObject({ matchesPlayed: 1, draws: 1, points: 1 });
    expect(tournament.standings.find(standing => standing.participantId === 'P2')).toMatchObject({ matchesPlayed: 1, draws: 1, points: 1 });
  });

  it('restarts after a committed BO2 game without re-executing that game', async () => {
    const crashDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-bo2-recovery-'));
    const crashRepository = new CrashAfterFirstSeriesGameRepository({ baseDir: crashDir });
    await crashRepository.initialize();
    try {
      const calls: string[] = [];
      const executor: MatchExecutor = {
        async executeMatch(matchId, playerA, playerB) {
          calls.push(matchId);
          return result(matchId, 'A');
        },
        async isAvailable() { return true; },
      };
      const config = { repository: crashRepository, executor, defaultMatchConfig: { bestOf: 2 as const } };
      const manager = new TournamentManager(config);
      await manager.createTournament('bo2-recovery', 'BO2 recovery', 'single_round_robin');
      await manager.registerParticipant('bo2-recovery', 'P1', 'Player 1', { botId: 'B1', command: 'node', args: [] });
      await manager.registerParticipant('bo2-recovery', 'P2', 'Player 2', { botId: 'B2', command: 'node', args: [] });
      await manager.openRegistration('bo2-recovery');
      await manager.generateSchedule('bo2-recovery');
      await manager.startTournament('bo2-recovery');

      expect((await manager.runAllMatches('bo2-recovery')).success).toBe(false);
      expect(calls).toHaveLength(1);

      const recoveryManager = new TournamentManager(config);
      expect((await recoveryManager.runAllMatches('bo2-recovery')).success).toBe(true);
      expect(calls).toHaveLength(2);
      expect(calls.filter(matchId => matchId.endsWith('-g1'))).toHaveLength(1);
      expect(calls.filter(matchId => matchId.endsWith('-g2'))).toHaveLength(1);

      const recovered = (await crashRepository.load('bo2-recovery'))!;
      const pairing = recovered.rounds[0]!.pairings[0]!;
      expect(pairing.seriesProgress).toMatchObject({ format: 'bo2', bestOf: 2, nextGame: 3, winsA: 1, winsB: 1 });
      expect(pairing.seriesProgress?.games).toHaveLength(2);
      for (const game of pairing.seriesProgress!.games) {
        expect(await crashRepository.loadMatchResult('bo2-recovery', game.matchId)).not.toBeNull();
        expect(await crashRepository.loadReplay('bo2-recovery', game.matchId)).not.toBeNull();
      }
      expect(await crashRepository.loadMatchResult('bo2-recovery', pairing.matchId!)).not.toBeNull();
      expect(await crashRepository.loadReplay('bo2-recovery', pairing.matchId!)).not.toBeNull();
    } finally {
      crashRepository.close();
      await fs.rm(crashDir, { recursive: true, force: true });
    }
  });
});
