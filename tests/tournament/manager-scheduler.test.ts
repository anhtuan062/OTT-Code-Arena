import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { BotDefinition, MatchConfig, MatchReplay, MatchResult } from '@match-runner/types.js';
import type {
  Tournament,
  TournamentMatchRecord,
  TournamentParticipant,
} from '@tournament/types.js';
import { MatchRunner } from '@match-runner/index.js';
import { generateRoundRobinSchedule } from '@tournament/scheduling.js';
import { createMultiStageTournament, getAllTournamentPairings } from '@tournament/multi-stage.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { TournamentManager, resolveSeriesSchedulerRuntimeConfig } from '@tournament/manager.js';
import type { MatchExecutor } from '@tournament/executor.js';
import { TournamentCommitCoordinator } from '@tournament/commit-coordinator.js';

function participants(count: number): TournamentParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `p-${index + 1}`,
    name: `P${index + 1}`,
    bot: { botId: `bot-${index + 1}`, player: 'A' as const, command: 'mock', args: [] },
    registeredAt: new Date(1000 + index).toISOString(),
  }));
}

function tournament(tournamentId: string, count = 4): Tournament {
  const tournamentParticipants = participants(count);
  return {
    tournamentId,
    name: tournamentId,
    format: 'single_round_robin',
    status: 'running',
    participants: tournamentParticipants,
    matchConfig: {
      protocolVersion: '0.1.0', maxTurns: 10, turnTimeoutMs: 1000,
      maxStdoutBytes: 1024, maxStderrBytes: 1024, failurePolicy: 'forfeit',
      maxRetries: 0, logRequests: false, logResponses: false, logStates: false, bestOf: 1,
    },
    scoringConfig: { winPoints: 3, drawPoints: 1, lossPoints: 0, byePoints: 0 },
    rounds: generateRoundRobinSchedule(tournamentParticipants),
    standings: tournamentParticipants.map(p => ({
      participantId: p.participantId, participantName: p.name, matchesPlayed: 0,
      wins: 0, draws: 0, losses: 0, forfeits: 0, points: 0, tiebreakHeadToHead: {},
    })),
    createdAt: new Date().toISOString(), registrationOpenedAt: new Date().toISOString(),
    registrationClosedAt: new Date().toISOString(), startedAt: new Date().toISOString(), completedAt: null,
  };
}

function seriesTournament(tournamentId: string, bestOf: 2 | 3): Tournament {
  const value = tournament(tournamentId);
  value.matchConfig.bestOf = bestOf;
  return value;
}

function multiStageTournament(tournamentId: string, participantCount = 8): Tournament {
  const tournamentParticipants = participants(participantCount);
  const value = createMultiStageTournament({
    tournamentId,
    name: tournamentId,
    participants: tournamentParticipants,
    matchConfig: {
      protocolVersion: '0.1.0', maxTurns: 10, turnTimeoutMs: 1000,
      maxStdoutBytes: 1024, maxStderrBytes: 1024, failurePolicy: 'forfeit',
      maxRetries: 0, logRequests: false, logResponses: false, logStates: false, bestOf: 1,
    },
    scoringConfig: { winPoints: 3, drawPoints: 1, lossPoints: 0, byePoints: 0 },
  });
  value.status = 'running';
  value.startedAt = new Date().toISOString();
  return value;
}

function result(matchId: string, a: BotDefinition, b: BotDefinition): MatchResult {
  return {
    matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'A',
    terminationReason: 'goal_reached', turnCount: 1, durationMs: 1,
    startTime: new Date(0).toISOString(), endTime: new Date(1).toISOString(),
    playerA: a, playerB: b,
    initialState: { turn: 0, currentPlayer: 'A', status: 'playing', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
    finalState: { turn: 1, currentPlayer: 'A', status: 'finished', winner: 'A', winReason: 'goal_reached', pieces: [], lastMove: null, positionHistory: [] },
    turnLog: [],
  };
}

class DeterministicExecutor implements MatchExecutor {
  readonly calls: string[] = [];
  constructor(private readonly repository: FileTournamentRepository, private readonly tournamentId: string, private readonly failures = new Set<string>()) {}

  async executeMatch(matchId: string, playerA: BotDefinition, playerB: BotDefinition, _config: MatchConfig): Promise<MatchResult> {
    this.calls.push(matchId);
    const snapshot = await this.repository.load(this.tournamentId);
    const pairing = snapshot?.rounds.flatMap(round => round.pairings).find(p => p.matchId === matchId);
    expect(pairing?.status).toBe('in_progress');
    if (this.failures.delete(matchId)) throw new Error('timeout in deterministic executor');
    return result(matchId, playerA, playerB);
  }

  async isAvailable(): Promise<boolean> { return true; }
}

class MultiStageDeterministicExecutor implements MatchExecutor {
  readonly calls: string[] = [];
  constructor(private readonly repository: FileTournamentRepository, private readonly tournamentId: string) {}

  async executeMatch(matchId: string, playerA: BotDefinition, playerB: BotDefinition, _config: MatchConfig): Promise<MatchResult> {
    this.calls.push(matchId);
    const snapshot = await this.repository.load(this.tournamentId);
    const pairing = snapshot && getAllTournamentPairings(snapshot).find(p =>
      p.matchId === matchId || (p.matchId !== null && matchId.startsWith(`${p.matchId}-g`))
    );
    expect(pairing?.status).toBe('in_progress');
    return result(matchId, playerA, playerB);
  }

  async isAvailable(): Promise<boolean> { return true; }
}

class ConcurrentDeterministicExecutor implements MatchExecutor {
  readonly calls: string[] = [];
  readonly activePairings = new Set<string>();
  maxActive = 0;
  private firstTwoStarted = 0;
  private readonly firstTwoReady: Promise<void>;
  private releaseFirstTwo!: () => void;

  constructor(private readonly repository: FileTournamentRepository, private readonly tournamentId: string) {
    this.firstTwoReady = new Promise(resolve => { this.releaseFirstTwo = resolve; });
  }

  async executeMatch(matchId: string, playerA: BotDefinition, playerB: BotDefinition): Promise<MatchResult> {
    if (this.calls.includes(matchId)) throw new Error(`duplicate execution: ${matchId}`);
    this.calls.push(matchId);
    const pairingMatchId = matchId.replace(/-g[123]$/, '');
    this.activePairings.add(pairingMatchId);
    this.maxActive = Math.max(this.maxActive, this.activePairings.size);
    try {
      if (this.firstTwoStarted < 2) {
        this.firstTwoStarted += 1;
        if (this.firstTwoStarted === 2) this.releaseFirstTwo();
        await this.firstTwoReady;
      }
      const snapshot = await this.repository.load(this.tournamentId);
      const pairing = snapshot && [
        ...snapshot.rounds.flatMap(round => round.pairings),
        ...getAllTournamentPairings(snapshot),
      ].find(p => p.matchId === pairingMatchId);
      expect(pairing?.status, `missing claimed pairing for ${matchId} (base ${pairingMatchId})`).toBe('in_progress');
      await new Promise(resolve => setTimeout(resolve, 1));
      return result(matchId, playerA, playerB);
    } finally {
      this.activePairings.delete(pairingMatchId);
    }
  }

  async isAvailable(): Promise<boolean> { return true; }
}

class CrashAfterArtifactRepository extends FileTournamentRepository {
  private failNextSnapshotSave = false;
  private crashInjected = false;

  override async saveMatchResult(tournamentId: string, matchId: string, match: TournamentMatchRecord, replay: MatchReplay): Promise<void> {
    await super.saveMatchResult(tournamentId, matchId, match, replay);
    if (!this.crashInjected) {
      this.crashInjected = true;
      this.failNextSnapshotSave = true;
    }
  }

  override async save(tournament: Tournament): Promise<void> {
    if (this.failNextSnapshotSave) {
      this.failNextSnapshotSave = false;
      throw new Error('injected crash after durable match artifact');
    }
    await super.save(tournament);
  }
}

describe('TournamentManager BO1 scheduler integration', () => {
  const directories: string[] = [];
  const repositories: Array<{ close(): void }> = [];

  afterEach(async () => {
    for (const repository of repositories.splice(0)) repository.close();
    await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
  });

  async function setup(repository: FileTournamentRepository, id: string, executor: MatchExecutor): Promise<TournamentManager> {
    await repository.initialize();
    await repository.save(tournament(id));
    return new TournamentManager({ repository, executor, enableBo1MatchScheduler: true });
  }

  it('defaults to scheduler concurrency 1 and validates the production concurrency-2 opt-in', () => {
    expect(resolveSeriesSchedulerRuntimeConfig({})).toEqual({
      enabled: false,
      concurrency: 1,
      concurrency2Enabled: false,
    });
    expect(resolveSeriesSchedulerRuntimeConfig({
      OTT_ENABLE_SERIES_SCHEDULER: 'true',
      OTT_SERIES_MATCH_CONCURRENCY: '1',
    })).toMatchObject({ enabled: true, concurrency: 1 });
    expect(resolveSeriesSchedulerRuntimeConfig({
      OTT_ENABLE_SERIES_SCHEDULER: 'true',
      OTT_SERIES_MATCH_CONCURRENCY: '2',
      OTT_ENABLE_SERIES_CONCURRENCY_2: 'true',
    })).toEqual({ enabled: true, concurrency: 2, concurrency2Enabled: true });
    expect(() => resolveSeriesSchedulerRuntimeConfig({ OTT_SERIES_MATCH_CONCURRENCY: '2' }))
      .toThrow(/requires OTT_ENABLE_SERIES_SCHEDULER/);
    expect(() => resolveSeriesSchedulerRuntimeConfig({
      OTT_ENABLE_SERIES_SCHEDULER: 'true', OTT_SERIES_MATCH_CONCURRENCY: '2',
    })).toThrow(/OTT_ENABLE_SERIES_CONCURRENCY_2/);
    expect(() => resolveSeriesSchedulerRuntimeConfig({ OTT_SERIES_MATCH_CONCURRENCY: '3' }))
      .toThrow(/must be 1 or 2/);
  });

  it('claims before execution and durably commits match/replay results', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-contract';
    const executor = new DeterministicExecutor(repository, id);
    const checkpoints: string[] = [];
    await repository.initialize();
    await repository.save(tournament(id));
    const manager = new TournamentManager({
      repository,
      executor,
      enableBo1MatchScheduler: true,
      onBo1SchedulerCheckpoint: checkpoint => checkpoints.push(checkpoint.phase),
    });

    const run = await manager.runAllMatches(id);
    expect(run.success).toBe(true);
    expect(checkpoints).toContain('dispatch');
    expect(checkpoints).toContain('settled');
    expect(executor.calls).toHaveLength(6);
    const saved = await repository.load(id);
    expect(saved?.rounds.flatMap(round => round.pairings).every(pairing => pairing.status === 'completed')).toBe(true);
    for (const pairing of saved!.rounds.flatMap(round => round.pairings)) {
      expect(await repository.loadMatchResult(id, pairing.matchId!)).not.toBeNull();
      expect(await repository.loadReplay(id, pairing.matchId!)).not.toBeNull();
    }
  });

  it('runs two independent BO1 pairings concurrently with durable, unique commits', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-concurrency-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-concurrency';
    await repository.initialize();
    await repository.save(tournament(id));
    const executor = new ConcurrentDeterministicExecutor(repository, id);
    const manager = new TournamentManager({
      repository,
      executor,
      enableBo1MatchScheduler: true,
      qaMaxActiveMatches: 2,
    });

    const run = await manager.runAllMatches(id);
    expect(run.success).toBe(true);
    expect(executor.maxActive).toBe(2);
    expect(new Set(executor.calls).size).toBe(executor.calls.length);
    expect(executor.calls).toHaveLength(6);
    const saved = await repository.load(id);
    expect(saved?.rounds.flatMap(round => round.pairings).every(pairing => pairing.status === 'completed')).toBe(true);
    for (const pairing of saved!.rounds.flatMap(round => round.pairings)) {
      expect(await repository.loadMatchResult(id, pairing.matchId!)).not.toBeNull();
      expect(await repository.loadReplay(id, pairing.matchId!)).not.toBeNull();
    }
  });

  it('keeps two concurrently running tournaments isolated at scheduler concurrency 2', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-two-tournaments-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const firstId = 'scheduler-concurrent-tournament-a';
    const secondId = 'scheduler-concurrent-tournament-b';
    await repository.initialize();
    await repository.save(seriesTournament(firstId, 2));
    await repository.save(seriesTournament(secondId, 2));
    const calls: string[] = [];
    const active = new Set<string>();
    let peakActive = 0;
    const executor: MatchExecutor = {
      async executeMatch(matchId, playerA, playerB) {
        if (calls.includes(matchId)) throw new Error(`duplicate execution: ${matchId}`);
        calls.push(matchId);
        active.add(matchId);
        peakActive = Math.max(peakActive, active.size);
        try {
          await new Promise(resolve => setTimeout(resolve, 1));
          return result(matchId, playerA, playerB);
        } finally {
          active.delete(matchId);
        }
      },
      async isAvailable() { return true; },
    };
    const manager = new TournamentManager({
      repository,
      executor,
      enableBo1MatchScheduler: true,
      seriesMatchConcurrency: 2,
      enableSeriesConcurrency2: true,
    });

    const [firstRun, secondRun] = await Promise.all([
      manager.runAllMatches(firstId),
      manager.runAllMatches(secondId),
    ]);
    expect(firstRun.success).toBe(true);
    expect(secondRun.success).toBe(true);
    expect(peakActive).toBeLessThanOrEqual(4);
    expect(new Set(calls).size).toBe(calls.length);
    for (const id of [firstId, secondId]) {
      const saved = await repository.load(id);
      expect(saved?.status).toBe('completed');
      expect(saved?.rounds.every(round => round.pairings.every(pairing => pairing.status === 'completed'))).toBe(true);
    }
  }, 30_000);

  it.each([
    { bestOf: 2 as const, games: 2 as const },
    { bestOf: 3 as const, games: 3 as const },
  ])('executes BO$bestOf series as concurrent pairing units with durable game checkpoints', async ({ bestOf, games }) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `ott-manager-scheduler-bo${bestOf}-`));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = `scheduler-bo${bestOf}`;
    await repository.initialize();
    await repository.save(seriesTournament(id, bestOf));
    const executor = new ConcurrentDeterministicExecutor(repository, id);
    const manager = new TournamentManager({
      repository,
      executor,
      enableBo1MatchScheduler: true,
      qaMaxActiveMatches: 2,
    });

    const run = await manager.runAllMatches(id);
    expect(run.success).toBe(true);
    expect(executor.maxActive).toBe(2);
    expect(new Set(executor.calls).size).toBe(executor.calls.length);
    const saved = await repository.load(id);
    const pairings = saved!.rounds.flatMap(round => round.pairings);
    expect(pairings.every(pairing => pairing.status === 'completed')).toBe(true);
    expect(executor.calls).toHaveLength(pairings.length * games);
    for (const pairing of pairings) {
      const aggregate = await repository.loadMatchResult(id, pairing.matchId!);
      const replay = await repository.loadReplay(id, pairing.matchId!);
      expect(aggregate?.series?.games).toHaveLength(games);
      expect(replay?.series?.games).toHaveLength(games);
      for (let game = 1; game <= games; game += 1) {
        const gameId = `${id}-${pairing.pairingId}-g${game}`;
        expect(await repository.loadMatchResult(id, gameId)).not.toBeNull();
        expect(await repository.loadReplay(id, gameId)).not.toBeNull();
      }
    }
  }, 30_000);

  it('persists retryable executor failure and retries it on the next run', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-failure-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-failure';
    const firstPairing = tournament(id).rounds[0]!.pairings[0]!;
    const executor = new DeterministicExecutor(repository, id, new Set([`${id}-${firstPairing.pairingId}`]));
    const manager = await setup(repository, id, executor);

    expect((await manager.runAllMatches(id)).success).toBe(false);
    const failed = (await repository.load(id))!.rounds.flatMap(round => round.pairings).find(p => p.pairingId === firstPairing.pairingId);
    expect(failed?.status).toBe('failed');
    expect((await manager.runAllMatches(id)).success).toBe(true);
    expect(executor.calls.filter(call => call === `${id}-${firstPairing.pairingId}`)).toHaveLength(2);
  });

  it('recovers a crash after artifact persistence without re-executing the match and accepts an idempotent commit', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-crash-'));
    directories.push(directory);
    const repository = new CrashAfterArtifactRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-crash';
    const executor = new DeterministicExecutor(repository, id);
    const manager = await setup(repository, id, executor);

    expect((await manager.runAllMatches(id)).success).toBe(false);
    const firstMatchId = executor.calls[0]!;
    expect(await repository.loadMatchResult(id, firstMatchId)).not.toBeNull();

    const recoveryManager = new TournamentManager({ repository, executor, enableBo1MatchScheduler: true });
    expect((await recoveryManager.runAllMatches(id)).success).toBe(true);
    expect(executor.calls.filter(call => call === firstMatchId)).toHaveLength(1);
    expect(executor.calls.length).toBe(6);

    const recovered = await repository.load(id);
    const pairing = recovered!.rounds.flatMap(round => round.pairings).find(p => p.matchId === firstMatchId)!;
    const record = await repository.loadMatchResult(id, firstMatchId);
    const replay = await repository.loadReplay(id, firstMatchId);
    const retry = await new TournamentCommitCoordinator(repository).commitMatchResult({
      tournamentId: id, pairingId: pairing.pairingId, matchResult: record!, replay: replay!,
    });
    expect(retry.idempotent).toBe(true);
  });

  it('resumes a claimed BO2 series from the next durable game after a scheduler crash', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-series-crash-'));
    directories.push(directory);
    const repository = new CrashAfterArtifactRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-series-crash';
    await repository.initialize();
    await repository.save(seriesTournament(id, 2));
    const executor = new ConcurrentDeterministicExecutor(repository, id);
    const manager = new TournamentManager({ repository, executor, enableBo1MatchScheduler: true, qaMaxActiveMatches: 2 });

    expect((await manager.runAllMatches(id)).success).toBe(false);
    const firstGameId = executor.calls.find(call => /-g1$/.test(call));
    expect(firstGameId).toBeDefined();
    const interrupted = (await repository.load(id))!.rounds.flatMap(round => round.pairings)
      .find(pairing => firstGameId!.startsWith(`${id}-${pairing.pairingId}-`));
    expect(interrupted).toBeDefined();
    expect(executor.calls.filter(call => call === firstGameId)).toHaveLength(1);
    expect(await repository.loadMatchResult(id, firstGameId!)).not.toBeNull();

    // With scheduler concurrency=2, the crash is injected into whichever
    // series reaches the snapshot save first; executor call order is not a
    // durable indication of which series was interrupted (especially on CI).
    const afterCrash = (await repository.load(id))!;
    const pendingPairingIds = new Set(afterCrash.rounds.flatMap(round => round.pairings)
      .filter(pairing => pairing.status !== 'completed')
      .map(pairing => pairing.pairingId));
    const firstGameRecords = await Promise.all(executor.calls
      .filter(call => /-g1$/.test(call))
      .map(async matchId => ({ matchId, record: await repository.loadMatchResult(id, matchId) })));
    const interruptedGame = firstGameRecords
      .find(item => item.record?.seriesGameOf && pendingPairingIds.has(item.record.pairingId))?.record;
    expect(interruptedGame).toBeDefined();

    const recoveryCalls: string[] = [];
    const recoveryExecutor: MatchExecutor = {
      async executeMatch(matchId, playerA, playerB) {
        recoveryCalls.push(matchId);
        return result(matchId, playerA, playerB);
      },
      async isAvailable() { return true; },
    };
    const recoveryManager = new TournamentManager({
      repository,
      executor: recoveryExecutor,
      enableBo1MatchScheduler: true,
      seriesMatchConcurrency: 1,
    });
    expect((await recoveryManager.runAllMatches(id)).success).toBe(true);
    const recovered = await repository.load(id);
    expect(recovered!.rounds.flatMap(round => round.pairings).every(pairing => pairing.status === 'completed')).toBe(true);
    expect(recoveryCalls.some(call => /-g1$/.test(call))).toBe(false);
    const interruptedSeriesPrefix = interruptedGame!.seriesGameOf!;
    const interruptedSeriesCalls = recoveryCalls.filter(call => call.startsWith(`${interruptedSeriesPrefix}-`));
    expect(interruptedSeriesCalls).toEqual([`${interruptedSeriesPrefix}-g2`]);
  }, 30_000);

  it('runs multi-stage BO2/BO3 series through the QA concurrency-2 scheduler and advances stages authoritatively', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-multistage-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-multistage';
    const value = multiStageTournament(id);
    await repository.initialize();
    await repository.save(value);
    const executor = new MultiStageDeterministicExecutor(repository, id);
    const manager = new TournamentManager({
      repository,
      executor,
      enableMultiStage: true,
      enableBo1MatchScheduler: true,
      qaMaxActiveMatches: 2,
    });

    const run = await manager.runAllMatches(id);
    expect(run.success).toBe(true);
    const saved = await repository.load(id);
    expect(saved?.status).toBe('completed');
    expect(saved?.stages?.every(stage => stage.status === 'completed')).toBe(true);
    const groupPairings = saved!.stages!.find(stage => stage.stageType === 'group_stage')!.groups!
      .flatMap(group => group.rounds.flatMap(round => round.pairings))
      .filter(pairing => pairing.participantB !== null);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.format === 'bo2')).toBe(true);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.games.length === 2)).toBe(true);
    const knockoutPairings = saved!.stages!.find(stage => stage.stageType === 'knockout')!.rounds!
      .flatMap(round => round.pairings)
      .filter(pairing => pairing.participantB !== null);
    expect(knockoutPairings.every(pairing => pairing.matchResult?.series?.format === 'bo3')).toBe(true);
    expect(knockoutPairings.every(pairing => pairing.matchResult?.series?.games.length === 3)).toBe(true);
    expect(executor.calls.length).toBeGreaterThan(0);
  }, 30_000);

  it('uses the same series scheduler path at opt-in concurrency 1', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-manager-scheduler-multistage-serial-'));
    directories.push(directory);
    const repository = new FileTournamentRepository({ baseDir: directory });
    repositories.push(repository);
    const id = 'scheduler-multistage-serial';
    await repository.initialize();
    await repository.save(multiStageTournament(id, 4));
    const executor = new MultiStageDeterministicExecutor(repository, id);
    const checkpoints: string[] = [];
    const manager = new TournamentManager({
      repository,
      executor,
      enableMultiStage: true,
      enableBo1MatchScheduler: true,
      onBo1SchedulerCheckpoint: checkpoint => checkpoints.push(checkpoint.phase),
    });

    const run = await manager.runAllMatches(id);
    expect(run.success).toBe(true);
    expect(checkpoints).toContain('dispatch');
    const saved = await repository.load(id);
    expect(saved?.status).toBe('completed');
    expect(saved?.stages?.every(stage => stage.status === 'completed')).toBe(true);
    const groupPairings = saved!.stages!.find(stage => stage.stageType === 'group_stage')!.groups!
      .flatMap(group => group.rounds.flatMap(round => round.pairings))
      .filter(pairing => pairing.participantB !== null);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.format === 'bo2')).toBe(true);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.games.length === 2)).toBe(true);
  }, 30_000);
});
