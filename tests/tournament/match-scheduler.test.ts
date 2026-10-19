import { describe, expect, it } from 'vitest';
import type { Tournament, TournamentPairing } from '@tournament/types.js';
import { MatchScheduler, runParallelMatchScheduler } from '@tournament/match-scheduler.js';
import type { MatchSchedulerClaim } from '@tournament/match-scheduler.js';

function pairing(id: string, roundNumber: number, a: string, b: string): TournamentPairing {
  return {
    pairingId: id,
    roundNumber,
    participantA: a,
    participantB: b,
    status: 'scheduled',
    matchId: null,
    matchResult: null,
    startedAt: null,
    completedAt: null,
  };
}

function tournament(pairings: TournamentPairing[]): Tournament {
  return {
    tournamentId: 't1', name: 'test', format: 'single_round_robin', status: 'running',
    participants: [],
    matchConfig: {} as Tournament['matchConfig'], scoringConfig: {} as Tournament['scoringConfig'],
    rounds: [{ roundNumber: 1, pairings }], standings: [],
    createdAt: '', registrationOpenedAt: null, registrationClosedAt: null, startedAt: null, completedAt: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

class MockSchedulerRepository {
  private readonly state: Tournament;

  constructor(tournamentState: Tournament) {
    this.state = structuredClone(tournamentState);
  }

  async refresh(): Promise<Tournament> {
    return structuredClone(this.state);
  }

  async claim(pairing: TournamentPairing): Promise<MatchSchedulerClaim | false> {
    const current = this.find(pairing.pairingId);
    if (!current || current.status !== 'scheduled') return false;
    current.status = 'in_progress';
    current.matchId = `claim-${current.pairingId}`;
    current.startedAt = new Date(0).toISOString();
    return { claimId: current.matchId, pairing: structuredClone(current) };
  }

  async commit(pairing: TournamentPairing): Promise<void> {
    const current = this.find(pairing.pairingId);
    if (!current) throw new Error(`Unknown pairing ${pairing.pairingId}`);
    current.status = 'completed';
    current.completedAt = new Date(0).toISOString();
  }

  status(pairingId: string): string | undefined {
    return this.find(pairingId)?.status;
  }

  private find(pairingId: string): TournamentPairing | undefined {
    return this.state.rounds.flatMap(round => round.pairings).find(item => item.pairingId === pairingId);
  }
}

describe('MatchScheduler', () => {
  it('defaults to sequential execution and supports at most two independent pairings', async () => {
    const pairings = [pairing('p1', 1, 'a', 'b'), pairing('p2', 1, 'c', 'd'), pairing('p3', 1, 'e', 'f')];
    const repository = new MockSchedulerRepository(tournament(pairings));
    const bothStarted = deferred<void>();
    const releaseWorkers = deferred<void>();
    let active = 0;
    let maximum = 0;
    const run = runParallelMatchScheduler(tournament(pairings), {
      async execute(p) {
        active++;
        maximum = Math.max(maximum, active);
        if (active === 2) bothStarted.resolve();
        await releaseWorkers.promise;
        active--;
        return p.pairingId;
      },
    }, {
      maxConcurrentMatches: 2,
      claim: repository.claim.bind(repository),
      refresh: repository.refresh.bind(repository),
      onComplete: repository.commit.bind(repository),
    });

    await bothStarted.promise;
    releaseWorkers.resolve();
    const result = await run;

    expect(maximum).toBe(2);
    expect(result.completed.map(item => item.pairingId)).toEqual(['p1', 'p2', 'p3']);
    expect(pairings.every(p => p.status === 'scheduled')).toBe(true);
    expect(repository.status('p1')).toBe('completed');
    expect(repository.status('p2')).toBe('completed');
    expect(repository.status('p3')).toBe('completed');
    expect(result.unsettledClaims).toEqual([]);
    expect(() => new MatchScheduler({ execute: async () => undefined }, { concurrency: 3 })).toThrow(RangeError);
  });

  it('does not claim shared participants or duplicate pairing ids', async () => {
    const pairings = [pairing('same', 1, 'a', 'b'), pairing('same', 1, 'a', 'b'), pairing('independent', 1, 'c', 'd')];
    const calls: string[] = [];
    const result = await runParallelMatchScheduler(tournament(pairings), {
      async execute(p) { calls.push(p.pairingId); return p.pairingId; },
    }, { concurrency: 2 });

    expect(calls).toEqual(['same', 'independent']);
    expect(result.completed).toHaveLength(2);
  });

  it('never dispatches a pairing when its durable claim is rejected', async () => {
    const calls: string[] = [];
    const result = await runParallelMatchScheduler(tournament([
      pairing('rejected', 1, 'a', 'b'),
      pairing('accepted', 1, 'c', 'd'),
    ]), {
      async execute(p) {
        calls.push(p.pairingId);
        return p.pairingId;
      },
    }, {
      claim: async p => p.pairingId === 'rejected' ? false : { claimId: 'accepted' },
    });

    expect(calls).toEqual(['accepted']);
    expect(result.failures).toEqual([]);
  });

  it('enforces a round barrier before starting later rounds', async () => {
    const first = pairing('r1', 1, 'a', 'b');
    const later = pairing('r2', 2, 'c', 'd');
    const rounds = [{ roundNumber: 1, pairings: [first] }, { roundNumber: 2, pairings: [later] }];
    const t = { ...tournament([]), rounds };
    const order: string[] = [];
    await runParallelMatchScheduler(t, { async execute(p) { order.push(p.pairingId); return p.pairingId; } }, { concurrency: 2 });
    expect(order).toEqual(['r1', 'r2']);
  });

  it('waits for a source pairing dependency before claiming the dependent pairing', async () => {
    const source = pairing('source', 1, 'a', 'b');
    const dependent = pairing('dependent', 1, 'c', 'd');
    dependent.slotA = { slotId: 'a', sourceType: 'knockout_winner', participantId: 'c', placeholder: 'source-winner', sourceRef: { pairingId: 'source' } };
    const repository = new MockSchedulerRepository(tournament([source, dependent]));
    const calls: string[] = [];
    await runParallelMatchScheduler(tournament([source, dependent]), {
      async execute(p) { calls.push(p.pairingId); return p.pairingId; },
    }, {
      concurrency: 2,
      claim: repository.claim.bind(repository),
      refresh: repository.refresh.bind(repository),
      onComplete: repository.commit.bind(repository),
    });
    expect(calls).toEqual(['source', 'dependent']);
  });

  it('reports actionable no-progress state for an unresolved scheduled pairing', async () => {
    const blocked = pairing('blocked', 1, '', 'b');
    const checkpoints: string[] = [];
    const result = await runParallelMatchScheduler(tournament([blocked]), {
      async execute() { throw new Error('executor must not be called'); },
    }, {
      onCheckpoint: checkpoint => {
        if (checkpoint.phase === 'no_progress') checkpoints.push(checkpoint.detail ?? '');
      },
    });

    expect(result.failures).toHaveLength(1);
    expect(String(result.failures[0]!.error)).toContain('blocked pairings');
    expect(checkpoints[0]).toContain('blocked');
  });

  it('cancels new claims and waits for active workers to settle', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const t = tournament([pairing('p1', 1, 'a', 'b'), pairing('p2', 1, 'c', 'd')]);
    const scheduler = new MatchScheduler<string>({
      execute(p) { return p.pairingId === 'p1' ? first.promise : second.promise; },
    }, { concurrency: 2 });
    const run = scheduler.run(t);
    await Promise.resolve();
    scheduler.cancel('test cancellation');
    first.resolve('settled');
    second.resolve('settled');
    const result = await run;

    expect(result.cancelled).toBe(true);
    expect(result.completed).toHaveLength(0);
    expect(t.rounds[0]!.pairings.every(p => p.status === 'cancelled')).toBe(true);
  });

  it('stops dispatching while allowing an active BO3 series checkpoint to commit', async () => {
    const series = deferred<string>();
    const claimed: string[] = [];
    const committed: string[] = [];
    const t = tournament([pairing('bo3-series', 1, 'a', 'b'), pairing('next-series', 1, 'c', 'd')]);
    const scheduler = new MatchScheduler<string>({
      execute(p) {
        claimed.push(p.pairingId);
        return series.promise;
      },
    }, {
      concurrency: 1,
      onComplete: async p => { committed.push(p.pairingId); },
    });

    const run = scheduler.run(t);
    while (claimed.length === 0) await Promise.resolve();
    scheduler.stopDispatching();
    series.resolve('checkpoint-committed');
    const result = await run;

    expect(result.cancelled).toBe(false);
    expect(claimed).toEqual(['bo3-series']);
    expect(committed).toEqual(['bo3-series']);
    expect(result.completed.map(item => item.pairingId)).toEqual(['bo3-series']);
  });

  it('drains durable claims and exposes unsettled claims without mutating the stale snapshot', async () => {
    const pairings = [pairing('p1', 1, 'a', 'b'), pairing('p2', 1, 'c', 'd')];
    const t = tournament(pairings);
    const repository = new MockSchedulerRepository(t);
    const started = deferred<void>();
    const workers = new Map<string, ReturnType<typeof deferred<string>>>();
    const cleanup: string[] = [];
    const scheduler = new MatchScheduler<string>({
      execute(p) {
        const worker = deferred<string>();
        workers.set(p.pairingId, worker);
        if (workers.size === 2) started.resolve();
        return worker.promise;
      },
    }, {
      concurrency: 2,
      claim: repository.claim.bind(repository),
      refresh: repository.refresh.bind(repository),
      cleanup: async p => { cleanup.push(p.pairingId); },
    });

    const run = scheduler.run(t);
    await started.promise;
    scheduler.cancel('test cancellation');
    for (const worker of workers.values()) worker.resolve('settled');
    const result = await run;

    expect(result.cancelled).toBe(true);
    expect(result.completed).toEqual([]);
    expect(result.unsettledClaims.map(claim => claim.pairingId).sort()).toEqual(['p1', 'p2']);
    expect(cleanup.sort()).toEqual(['p1', 'p2']);
    expect(repository.status('p1')).toBe('in_progress');
    expect(repository.status('p2')).toBe('in_progress');
    expect(t.rounds[0]!.pairings.every(p => p.status === 'scheduled')).toBe(true);
  });
});
