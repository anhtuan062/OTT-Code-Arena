import { describe, expect, it } from 'vitest';
import { TournamentManager } from '@tournament/manager.js';
import { getSeriesSides } from '@tournament/series.js';
import type { LiveMatchSnapshot } from '@match-runner/types.js';

function snapshot(gameNumber: 1 | 2 | 3, sequence: number): LiveMatchSnapshot {
  return {
    matchId: 'series-1', gameNumber, status: 'in_progress', sequence, turn: sequence,
    currentPlayer: 'A',
    state: { boardSize: 9, currentPlayer: 'A', turn: sequence, pieces: [], status: 'playing', winner: null, winReason: null, lastMove: null },
    latestMove: null, updatedAt: new Date(sequence * 1000).toISOString(),
  };
}

describe('BO3 live snapshot ordering', () => {
  it('accepts a new game with a lower sequence and rejects stale older games', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tournamentId: string, value: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);
    publish('tournament-1', snapshot(1, 1));
    publish('tournament-1', snapshot(1, 7));
    publish('tournament-1', snapshot(2, 1));
    publish('tournament-1', snapshot(1, 8));

    expect(manager.getLiveMatchSnapshot('tournament-1', 'series-1')).toMatchObject({ gameNumber: 2, sequence: 1 });
    expect(manager.getLiveMatchHistory('tournament-1', 'series-1').map(frame => `${frame.gameNumber}:${frame.sequence}`)).toEqual(['1:1', '1:7', '2:1']);
  });

  it('does not append duplicate polling frames to history', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tournamentId: string, value: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);
    const frame = snapshot(3, 1);
    publish('tournament-1', frame);
    publish('tournament-1', { ...frame });
    expect(manager.getLiveMatchHistory('tournament-1', 'series-1')).toHaveLength(1);
  });

  it('maps the live A/B labels to the actual sides for every game', () => {
    let seed = 0;
    let gameOne: ReturnType<typeof getSeriesSides> | undefined;
    let gameTwo: ReturnType<typeof getSeriesSides> | undefined;
    while (seed < 10_000 && (!gameOne || !gameTwo || gameOne.playerA === gameTwo.playerA)) {
      gameOne = getSeriesSides(String(seed), 1, 'participant-a', 'participant-b');
      gameTwo = getSeriesSides(String(seed), 2, 'participant-a', 'participant-b');
      seed += 1;
    }

    expect(gameOne).toBeDefined();
    expect(gameTwo).toBeDefined();
    expect(gameOne?.playerA).not.toBe(gameTwo?.playerA);
    expect(new Set([gameOne?.playerA, gameOne?.playerB])).toEqual(new Set(['participant-a', 'participant-b']));
    expect(new Set([gameTwo?.playerA, gameTwo?.playerB])).toEqual(new Set(['participant-a', 'participant-b']));
  });
});
