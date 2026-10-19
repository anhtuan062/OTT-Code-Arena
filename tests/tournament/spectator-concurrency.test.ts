import { describe, expect, it } from 'vitest';
import { TournamentManager } from '@tournament/manager.js';
import type { LiveMatchSnapshot } from '@match-runner/types.js';

function makeSnapshot(
  matchId: string,
  sequence: number,
  status: 'in_progress' | 'finished' = 'in_progress',
  gameNumber: 1 | 2 | 3 = 1
): LiveMatchSnapshot {
  return {
    matchId,
    gameNumber,
    status,
    sequence,
    turn: sequence,
    currentPlayer: sequence % 2 === 1 ? 'A' : 'B',
    state: {
      boardSize: 9,
      currentPlayer: sequence % 2 === 1 ? 'A' : 'B',
      turn: sequence,
      pieces: [],
      status: status === 'finished' ? 'finished' : 'playing',
      winner: status === 'finished' ? 'A' : null,
      winReason: status === 'finished' ? 'goal_reached' : null,
      lastMove: null,
    },
    latestMove: null,
    updatedAt: new Date(1000 * sequence).toISOString(),
  };
}

describe('Spectator Concurrency & Cache Isolation', () => {
  it('isolates distinct tournamentId:matchId channels and subscribers', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    const t1m1Events: LiveMatchSnapshot[] = [];
    const t1m2Events: LiveMatchSnapshot[] = [];
    const t2m1Events: LiveMatchSnapshot[] = [];

    const unsubT1M1 = manager.subscribeLiveMatch('t1', 'm1', s => t1m1Events.push(s));
    const unsubT1M2 = manager.subscribeLiveMatch('t1', 'm2', s => t1m2Events.push(s));
    const unsubT2M1 = manager.subscribeLiveMatch('t2', 'm1', s => t2m1Events.push(s));

    // Interleaved publishing across concurrent matches and tournaments
    publish('t1', makeSnapshot('m1', 1));
    publish('t1', makeSnapshot('m2', 1));
    publish('t2', makeSnapshot('m1', 1)); // Same matchId 'm1', different tournament 't2'
    publish('t1', makeSnapshot('m1', 2));
    publish('t1', makeSnapshot('m2', 2));

    expect(t1m1Events.map(e => e.sequence)).toEqual([1, 2]);
    expect(t1m2Events.map(e => e.sequence)).toEqual([1, 2]);
    expect(t2m1Events.map(e => e.sequence)).toEqual([1]);

    // Verify snapshots in cache
    expect(manager.getLiveMatchSnapshot('t1', 'm1')?.sequence).toBe(2);
    expect(manager.getLiveMatchSnapshot('t1', 'm2')?.sequence).toBe(2);
    expect(manager.getLiveMatchSnapshot('t2', 'm1')?.sequence).toBe(1);

    // Unsubscribe t1m1 and ensure others continue to receive events
    unsubT1M1();
    publish('t1', makeSnapshot('m1', 3));
    publish('t1', makeSnapshot('m2', 3));

    expect(t1m1Events.map(e => e.sequence)).toEqual([1, 2]); // Not updated
    expect(t1m2Events.map(e => e.sequence)).toEqual([1, 2, 3]); // Updated

    unsubT1M2();
    unsubT2M1();
  });

  it('retains independent history for concurrent matches up to 512 frames', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    // Publish interleaved frames
    for (let i = 1; i <= 10; i++) {
      publish('t1', makeSnapshot('match-A', i));
      publish('t1', makeSnapshot('match-B', i * 2));
    }

    const historyA = manager.getLiveMatchHistory('t1', 'match-A');
    const historyB = manager.getLiveMatchHistory('t1', 'match-B');

    expect(historyA).toHaveLength(10);
    expect(historyB).toHaveLength(10);
    expect(historyA.map(f => f.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(historyB.map(f => f.sequence)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it('maintains monotonic frame ordering when concurrent matches emit interleaved frames', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    // Stale frames arriving out of order for Match A should be ignored
    publish('t1', makeSnapshot('match-A', 5));
    publish('t1', makeSnapshot('match-B', 1));
    publish('t1', makeSnapshot('match-A', 3)); // Stale: lower sequence
    publish('t1', makeSnapshot('match-B', 2));
    publish('t1', makeSnapshot('match-A', 6)); // Newer: higher sequence

    expect(manager.getLiveMatchSnapshot('t1', 'match-A')?.sequence).toBe(6);
    expect(manager.getLiveMatchSnapshot('t1', 'match-B')?.sequence).toBe(2);
    expect(manager.getLiveMatchHistory('t1', 'match-A').map(f => f.sequence)).toEqual([5, 6]);
  });

  it('prioritizes evicting finished matches over in_progress matches when cache exceeds 64 entries', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    // 1. Publish active match
    publish('t1', makeSnapshot('active-1', 1, 'in_progress'));

    // 2. Publish 64 finished matches
    for (let i = 1; i <= 64; i++) {
      publish('t1', makeSnapshot(`finished-${i}`, 10, 'finished'));
    }

    // Cache size is capped at 64
    // Active match MUST still be in cache because finished matches are evicted first
    expect(manager.getLiveMatchSnapshot('t1', 'active-1')).not.toBeNull();
    expect(manager.getLiveMatchSnapshot('t1', 'active-1')?.status).toBe('in_progress');

    // The oldest finished match ('finished-1') should have been evicted
    expect(manager.getLiveMatchSnapshot('t1', 'finished-1')).toBeNull();
    // Recent finished match should still be in cache
    expect(manager.getLiveMatchSnapshot('t1', 'finished-64')).not.toBeNull();
  });

  it('prioritizes preserving active matches with live subscribers over unsubscribed active matches', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    // Active match 1 has an active subscriber
    const unsub = manager.subscribeLiveMatch('t1', 'watched-active', () => {});
    publish('t1', makeSnapshot('watched-active', 1, 'in_progress'));

    // Publish 64 other active matches without subscribers
    for (let i = 1; i <= 64; i++) {
      publish('t1', makeSnapshot(`unwatched-active-${i}`, 1, 'in_progress'));
    }

    // Watched active match MUST remain in cache
    expect(manager.getLiveMatchSnapshot('t1', 'watched-active')).not.toBeNull();
    expect(manager.getLiveMatchSnapshot('t1', 'watched-active')?.status).toBe('in_progress');

    // The oldest unwatched active match ('unwatched-active-1') was evicted instead
    expect(manager.getLiveMatchSnapshot('t1', 'unwatched-active-1')).toBeNull();

    unsub();
  });

  it('gracefully evicts oldest entry when active matches exceed 64 capacity in the same tier', () => {
    const manager = new TournamentManager({ repository: {} as never, executor: {} as never });
    const publish = (manager as unknown as { publishLiveSnapshot: (tId: string, s: LiveMatchSnapshot) => void }).publishLiveSnapshot.bind(manager);

    // 65 active matches, all in the same tier (no subscribers)
    for (let i = 1; i <= 65; i++) {
      publish('t1', makeSnapshot(`active-${i}`, 1, 'in_progress'));
    }

    // active-1 (oldest expiresAt) is evicted
    expect(manager.getLiveMatchSnapshot('t1', 'active-1')).toBeNull();
    // active-65 (newest) remains
    expect(manager.getLiveMatchSnapshot('t1', 'active-65')).not.toBeNull();
  });
});
