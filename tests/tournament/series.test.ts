import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { TournamentManager } from '@tournament/manager.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import type { MatchExecutor } from '@tournament/executor.js';
import type { MatchResult } from '@match-runner/types.js';

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
    await manager.createTournament('bo3', 'BO3');
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
    await manager.createTournament('bo3-stop', 'BO3 stop');
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
});
