import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { initializeDatabase } from '../../server/db.js';
import { SqlTournamentMatchJobRepository } from '../../server/repositories/tournament-match-job-repository.js';
import type { TournamentPairing } from '../../tournament/types.js';
import { FileTournamentRepository } from '../../tournament/persistence.js';
import { TournamentManager } from '../../tournament/manager.js';
import type { MatchExecutor } from '../../tournament/executor.js';
import type { ExecutedMatchResult } from '../../tournament/executor.js';
import { FairMatchDispatcher } from '../../tournament/fair-match-dispatcher.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });

function pairing(id: string, status: TournamentPairing['status'] = 'scheduled'): TournamentPairing {
  return { pairingId: id, roundNumber: 1, participantA: `a-${id}`, participantB: `b-${id}`, status, matchId: null, matchResult: null, startedAt: null, completedAt: null } as TournamentPairing;
}

async function open() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-match-jobs-'));
  dirs.push(dir);
  const db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
  return { db, jobs: new SqlTournamentMatchJobRepository(db) };
}

describe('SQLite tournament match jobs', () => {
  it('fairly interleaves concurrent run_all tournaments without monopolization', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-fair-integration-'));
    dirs.push(dir);
    const repository = new FileTournamentRepository({ baseDir: path.join(dir, 'tournaments') });
    await repository.initialize();
    const db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    const jobs = new SqlTournamentMatchJobRepository(db);
    const dispatch = new FairMatchDispatcher<ExecutedMatchResult>(2);
    const order: string[] = [];
    const executor: MatchExecutor = {
      isAvailable: async () => true,
      executeMatch: async (matchId, playerA, playerB) => {
        order.push(matchId.split('-')[0]!);
        await new Promise(resolve => setTimeout(resolve, 2));
        return {
          matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A', terminationReason: 'goal_reached', turnCount: 1,
          startTime: new Date().toISOString(), endTime: new Date().toISOString(), durationMs: 1,
          playerA: { ...playerA }, playerB: { ...playerB }, turnLog: [],
          initialState: { turn: 0, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
          finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
        } as any;
      },
    };
    const manager = new TournamentManager({ repository, executor });
    const create = async (id: string, count: number) => {
      await manager.createTournament(id, id, 'round_robin');
      const tournament = (await repository.load(id))!;
      tournament.participants = Array.from({ length: count }, (_, index) => ({
        participantId: `${id}-p${index}`, name: `${id}-p${index}`,
        bot: { botId: `${id}-b${index}`, player: 'A' as const, command: 'mock' }, registeredAt: new Date().toISOString(),
      }));
      tournament.status = 'registration_closed';
      await repository.save(tournament);
      await manager.generateSchedule(id);
      await manager.startTournament(id);
    };
    await create('large-fair', 4);
    await create('short-fair', 2);
    manager.setMatchJobStore(jobs, 'fair-worker', 1000);
    manager.setFairMatchDispatcher(dispatch);

    const [large, short] = await Promise.all([
      manager.runAllMatches('large-fair'),
      manager.runAllMatches('short-fair'),
    ]);
    expect(large.success).toBe(true);
    expect(short.success).toBe(true);
    expect(order.indexOf('short')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('short')).toBeLessThan(6);
    expect((await repository.load('large-fair'))?.status).toBe('completed');
    expect((await repository.load('short-fair'))?.status).toBe('completed');
    db.close();
    repository.close();
  });

  it('resumes a BO3 checkpoint after interruption without replaying game one', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-bo3-fair-'));
    dirs.push(dir);
    let repository = new FileTournamentRepository({ baseDir: path.join(dir, 'tournaments') });
    await repository.initialize();
    let db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    let jobs = new SqlTournamentMatchJobRepository(db);
    let failGameTwo = true;
    const executed: string[] = [];
    const executor: MatchExecutor = {
      isAvailable: async () => true,
      executeMatch: async (matchId, playerA, playerB) => {
        executed.push(matchId);
        if (matchId.endsWith('-g2') && failGameTwo) {
          failGameTwo = false;
          throw new Error('simulated interruption after BO3 game one');
        }
        return {
          matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A', terminationReason: 'goal_reached', turnCount: 1,
          startTime: new Date().toISOString(), endTime: new Date().toISOString(), durationMs: 1,
          playerA: { ...playerA }, playerB: { ...playerB }, turnLog: [],
          initialState: { turn: 0, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
          finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
        } as any;
      },
    };
    const firstManager = new TournamentManager({ repository, executor });
    const tournamentId = 'bo3-fair-resume';
    await firstManager.createTournament(tournamentId, tournamentId, 'round_robin');
    const draft = (await repository.load(tournamentId))!;
    draft.participants = [0, 1].map(index => ({
      participantId: `p${index}`, name: `p${index}`, bot: { botId: `b${index}`, player: 'A' as const, command: 'mock' }, registeredAt: new Date().toISOString(),
    }));
    draft.matchConfig.bestOf = 3;
    draft.status = 'registration_closed';
    await repository.save(draft);
    await firstManager.generateSchedule(tournamentId);
    await firstManager.startTournament(tournamentId);
    firstManager.setMatchJobStore(jobs, 'bo3-worker-a', 1000);
    firstManager.setFairMatchDispatcher(new FairMatchDispatcher<ExecutedMatchResult>(2));

    const interrupted = await firstManager.runAllMatches(tournamentId);
    expect(interrupted.success).toBe(false);
    expect(executed.filter(id => id.endsWith('-g1'))).toHaveLength(1);
    expect(executed.filter(id => id.endsWith('-g2'))).toHaveLength(1);
    const afterInterruption = (await repository.load(tournamentId))!;
    const pairing = afterInterruption.rounds[0]!.pairings[0]!;
    expect(pairing.seriesProgress?.nextGame).toBe(2);
    expect(pairing.seriesProgress?.games).toHaveLength(1);

    db.close();
    repository.close();
    repository = new FileTournamentRepository({ baseDir: path.join(dir, 'tournaments') });
    await repository.initialize();
    db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    jobs = new SqlTournamentMatchJobRepository(db);
    const restarted = new TournamentManager({ repository, executor });
    restarted.setMatchJobStore(jobs, 'bo3-worker-b', 1000);
    restarted.setFairMatchDispatcher(new FairMatchDispatcher<ExecutedMatchResult>(2));
    const resumed = await restarted.runAllMatches(tournamentId);
    expect(resumed.success).toBe(true);
    expect(executed.filter(id => id.endsWith('-g1'))).toHaveLength(1);
    expect(executed.filter(id => id.endsWith('-g2'))).toHaveLength(2);
    expect((await repository.load(tournamentId))?.status).toBe('completed');
    expect(await repository.loadMatchResult(tournamentId, `${tournamentId}-${pairing.pairingId}-g1`)).not.toBeNull();
    expect(await repository.loadReplay(tournamentId, `${tournamentId}-${pairing.pairingId}-g1`)).not.toBeNull();
    db.close();
    repository.close();
  }, 20_000);

  it('runs run_all with SQLite jobs, resumes an interrupted lease, and preserves committed replay/results', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-match-integration-'));
    dirs.push(dir);
    const tournamentDir = path.join(dir, 'tournaments');
    let repository = new FileTournamentRepository({ baseDir: tournamentDir });
    await repository.initialize();
    let db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    let jobs = new SqlTournamentMatchJobRepository(db);
    const executed: string[] = [];
    const executor: MatchExecutor = {
      isAvailable: async () => true,
      executeMatch: async (matchId, playerA, playerB) => {
        executed.push(matchId);
        return {
          matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A', terminationReason: 'goal_reached',
          turnCount: 1, startTime: new Date().toISOString(), endTime: new Date().toISOString(), durationMs: 1,
          playerA: { ...playerA }, playerB: { ...playerB },
          initialState: { turn: 0, currentPlayer: 'A', status: 'in_progress', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
          finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
          turnLog: [],
        } as any;
      },
    };
    const manager = new TournamentManager({ repository, executor });
    const tournamentId = 'sqlite-job-run-all';
    await manager.createTournament(tournamentId, 'SQLite Job Arena', 'round_robin');
    const tournament = (await repository.load(tournamentId))!;
    tournament.participants = ['a', 'b', 'c', 'd'].map((id, index) => ({
      participantId: id, name: id, bot: { botId: `bot-${index}`, player: 'A' as const, command: 'mock' }, registeredAt: new Date().toISOString(),
    }));
    tournament.status = 'registration_closed';
    await repository.save(tournament);
    await manager.generateSchedule(tournamentId);
    await manager.startTournament(tournamentId);
    manager.setMatchJobStore(jobs, 'integration-worker', 1000);

    const allPairings = (await repository.load(tournamentId))!.rounds.flatMap(round => round.pairings);
    const committedPairing = allPairings[0]!;
    const unfinished = allPairings[1]!;
    jobs.ensureForTournament(tournamentId, allPairings);
    const abandoned = jobs.claim(tournamentId, unfinished.pairingId, 'crashed-worker', 20)!;
    expect(abandoned).not.toBeNull();
    await manager.runPairingById(tournamentId, committedPairing.pairingId);
    const callsBeforeRunAll = executed.length;
    const interruptedSnapshot = (await repository.load(tournamentId))!;
    const interruptedPairing = interruptedSnapshot.rounds.flatMap(round => round.pairings).find(pairing => pairing.pairingId === unfinished.pairingId)!;
    interruptedPairing.status = 'in_progress';
    interruptedPairing.matchId = `${tournamentId}-${unfinished.pairingId}`;
    interruptedPairing.startedAt = new Date().toISOString();
    await repository.save(interruptedSnapshot);

    db.close();
    repository.close();
    await new Promise(resolve => setTimeout(resolve, 30));
    repository = new FileTournamentRepository({ baseDir: tournamentDir });
    await repository.initialize();
    db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    jobs = new SqlTournamentMatchJobRepository(db);
    const restartedManager = new TournamentManager({ repository, executor });
    restartedManager.setMatchJobStore(jobs, 'restarted-worker', 1000);
    expect(await restartedManager.recoverInterruptedTournaments()).toBe(1);
    const result = await restartedManager.runAllMatches(tournamentId);
    expect(result.success).toBe(true);
    expect(executed.length).toBeGreaterThan(callsBeforeRunAll);
    expect(new Set(executed).size).toBe(executed.length);
    const finalTournament = (await repository.load(tournamentId))!;
    expect(finalTournament.status).toBe('completed');
    expect(finalTournament.standings).toHaveLength(4);
    const records = await repository.listMatchResults(tournamentId);
    expect(records).toHaveLength(6);
    for (const record of records) {
      expect(await repository.loadReplay(tournamentId, record.matchId)).not.toBeNull();
      expect(jobs.get(tournamentId, record.pairingId)?.status).toBe('completed');
    }
    expect(jobs.complete({ ...abandoned, fencingToken: abandoned.fencingToken - 1 })).toBe(false);
    db.close();
    repository.close();
  });

  it('recovers an unfinished claim after reopening the isolated database', async () => {
    const first = await open();
    const p = pairing('p1');
    first.jobs.ensureForTournament('t1', [p]);
    const claim = first.jobs.claim('t1', 'p1', 'worker-a', 1000);
    expect(claim).not.toBeNull();
    first.db.close();

    const second = await initializeDatabase({ path: path.join(dirs[0], 'arena.sqlite') });
    const jobs = new SqlTournamentMatchJobRepository(second);
    expect(jobs.claim('t1', 'p1', 'worker-b', 1000)).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 1100));
    const recovered = jobs.claim('t1', 'p1', 'worker-b', 1000);
    expect(recovered?.attemptCount).toBe(2);
    expect(recovered?.fencingToken).not.toBe(claim?.fencingToken);
    second.close();
  });

  it('rejects duplicate dispatch and stale completion', async () => {
    const { db, jobs } = await open();
    jobs.ensureForTournament('t1', [pairing('p1')]);
    const first = jobs.claim('t1', 'p1', 'a', 1000)!;
    expect(jobs.claim('t1', 'p1', 'b', 1000)).toBeNull();
    expect(jobs.complete({ ...first, fencingToken: first.fencingToken - 1 })).toBe(false);
    expect(jobs.complete(first)).toBe(true);
    db.close();
  });

  it('keeps queue descriptors bounded by claims and supports saturation', async () => {
    const { db, jobs } = await open();
    const pairings = [pairing('p1'), pairing('p2'), pairing('p3')];
    jobs.ensureForTournament('t1', pairings);
    const first = jobs.claim('t1', 'p1', 'a', 1000)!;
    expect(jobs.claim('t1', 'p1', 'b', 1000)).toBeNull();
    expect(jobs.claim('t1', 'p2', 'b', 1000)).not.toBeNull();
    expect(jobs.get('t1', 'p3')?.status).toBe('queued');
    jobs.release(first, 'test saturation');
    db.close();
  });

  it('marks a committed pairing complete during reconciliation without replaying it', async () => {
    const { db, jobs } = await open();
    const p = pairing('p1', 'completed');
    jobs.ensureForTournament('t1', [p]);
    jobs.reconcile('t1', [p], ['p1']);
    expect(jobs.get('t1', 'p1')?.status).toBe('completed');
    expect(jobs.claim('t1', 'p1', 'new-worker', 1000)).toBeNull();
    db.close();
  });

  it('requeues a series pairing so persisted game checkpoints can resume', async () => {
    const { db, jobs } = await open();
    const p = { ...pairing('series-1', 'in_progress'), seriesProgress: { format: 'bo3', bestOf: 3, seed: 'seed', nextGame: 2, winsA: 1, winsB: 0, games: [] } } as TournamentPairing;
    jobs.ensureForTournament('t1', [p]);
    const claim = jobs.claim('t1', p.pairingId, 'old-worker', 1000)!;
    jobs.reconcile('t1', [p], []);
    expect(jobs.get('t1', p.pairingId)?.status).toBe('queued');
    expect(jobs.claim('t1', p.pairingId, 'resume-worker', 1000)?.attemptCount).toBe(claim.attemptCount + 1);
    db.close();
  });

  it('fences an expired lease during organizer requeue and rejects a live lease', async () => {
    const { db, jobs } = await open();
    jobs.ensureForTournament('t1', [pairing('p1')]);
    const live = jobs.claim('t1', 'p1', 'worker-a', 1000)!;
    expect(jobs.requeue('t1', 'p1', 'organizer')).toBe(false);
    expect(jobs.get('t1', 'p1')?.leaseOwner).toBe(live.leaseOwner);

    // Use the repository's minimum lease window, then requeue atomically.
    expect(jobs.release(live, 'test')).toBe(true);
    const expired = jobs.claim('t1', 'p1', 'worker-b', 1);
    expect(expired).not.toBeNull();
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(jobs.requeue('t1', 'p1', 'organizer')).toBe(true);
    const queued = jobs.get('t1', 'p1')!;
    expect(queued.status).toBe('queued');
    expect(queued.leaseOwner).toBeNull();
    expect(queued.fencingToken).toBe(expired!.fencingToken + 1);
    expect(jobs.complete(expired!)).toBe(false);
    db.close();
  });

  it('requeues a failed series through the manager without deleting its checkpoint', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-requeue-'));
    dirs.push(dir);
    const repository = new FileTournamentRepository({ baseDir: path.join(dir, 'tournaments') });
    await repository.initialize();
    const db = await initializeDatabase({ path: path.join(dir, 'arena.sqlite') });
    const jobs = new SqlTournamentMatchJobRepository(db);
    const executor: MatchExecutor = {
      isAvailable: async () => true,
      executeMatch: async () => { throw new Error('not reached'); },
    };
    const manager = new TournamentManager({ repository, executor });
    await manager.createTournament('requeue-series', 'Requeue series', 'round_robin');
    const tournament = (await repository.load('requeue-series'))!;
    tournament.participants = [0, 1].map(index => ({
      participantId: `p${index}`, name: `p${index}`,
      bot: { botId: `b${index}`, player: 'A' as const, command: 'mock' }, registeredAt: new Date().toISOString(),
    }));
    tournament.matchConfig.bestOf = 3;
    tournament.status = 'registration_closed';
    await repository.save(tournament);
    await manager.generateSchedule('requeue-series');
    await manager.startTournament('requeue-series');
    const failed = (await repository.load('requeue-series'))!;
    const target = failed.rounds[0]!.pairings[0]!;
    target.status = 'failed';
    target.failureCode = 'DOCKER_INFRASTRUCTURE';
    target.failureReason = 'Docker execution infrastructure failed';
    target.seriesProgress = { format: 'bo3', bestOf: 3, seed: 'checkpoint-seed', nextGame: 2, winsA: 1, winsB: 0, games: [] };
    await repository.save(failed);
    jobs.ensureForTournament('requeue-series', failed.rounds.flatMap(round => round.pairings));
    manager.setMatchJobStore(jobs, 'requeue-worker', 1000);

    const claim = jobs.claim('requeue-series', target.pairingId, 'old-worker', 1000)!;
    expect(await manager.requeuePairing('requeue-series', target.pairingId)).toMatchObject({ success: false });
    expect(jobs.release(claim, 'failed attempt')).toBe(true);
    expect(await manager.requeuePairing('requeue-series', target.pairingId)).toMatchObject({ success: true });
    const reloaded = (await repository.load('requeue-series'))!;
    expect(reloaded.rounds[0]!.pairings[0]).toMatchObject({
      status: 'scheduled',
      seriesProgress: { seed: 'checkpoint-seed', nextGame: 2, winsA: 1, winsB: 0 },
    });
    expect((await manager.requeuePairing('requeue-series', target.pairingId)).success).toBe(false);

    db.close();
    repository.close();
  });
});
