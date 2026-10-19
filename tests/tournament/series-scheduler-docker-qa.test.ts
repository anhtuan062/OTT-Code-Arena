/**
 * Opt-in Windows-host Docker QA for the series-aware scheduler.
 *
 * The suite is skipped unless both QA flags are explicitly enabled. It uses
 * the approved digest-pinned runtime configuration from the host environment;
 * it never substitutes mutable images or bypasses registry validation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { BotDefinition, MatchConfig, MatchResult } from '@match-runner/types.js';
import type { MatchExecutor } from '@tournament/executor.js';
import type { Tournament, TournamentParticipant, TournamentPairing } from '@tournament/types.js';
import { createMultiStageTournament, getAllTournamentPairings } from '@tournament/multi-stage.js';
import { getSeriesSides } from '@tournament/series.js';
import { computeStandings } from '@tournament/scoring.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { TournamentManager } from '@tournament/manager.js';
import { createMatchRunnerExecutor } from '@tournament/executor.js';
import type { MatchSchedulerCheckpoint } from '@tournament/match-scheduler.js';
import {
  configuredRuntimeImageRegistry,
  createRevisionDockerExecutor,
  DockerExecutionLimiter,
  getStrategySdkIdentity,
} from '@bot-executor/index.js';
import type { SourceRevisionExecution } from '@match-runner/types.js';

const runQa = process.env.OTT_RUN_SERIES_DOCKER_QA === 'true' &&
  process.env.OTT_QA_ENABLE_BO1_SCHEDULER === 'true';
const suite = runQa ? describe : describe.skip;
const DEFAULT_COMPARISON_ORDER = [1, 2] as const;
const CPP_SOURCE = Buffer.from(
  'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }',
);
const REQUIRED_RUNTIME_ENV = [
  'BOT_TRUSTED_IMAGE_REGISTRIES',
  'BOT_CPP_COMPILER_IMAGE',
  'BOT_CPP_RUNTIME_IMAGE',
  'BOT_PYTHON3_RUNTIME_IMAGE',
] as const;

function parseComparisonOrder(value = process.env.OTT_QA_SERIES_COMPARISON_ORDER): Array<1 | 2> {
  const raw = value?.trim() || '1,2';
  const order = raw.split(',').map(item => Number(item.trim()));
  if (order.length !== 2 || order.some(item => item !== 1 && item !== 2) || new Set(order).size !== 2) {
    throw new Error('OTT_QA_SERIES_COMPARISON_ORDER must be 1,2 or 2,1');
  }
  return order as Array<1 | 2>;
}

function configuredQaRegistry() {
  const missing = REQUIRED_RUNTIME_ENV.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing Docker QA configuration: ${missing.join(', ')}. ` +
      'Load the approved digest-pinned values before enabling OTT_RUN_SERIES_DOCKER_QA.',
    );
  }
  return configuredRuntimeImageRegistry('sandbox-required', process.env);
}

function matchConfig(): Tournament['matchConfig'] {
  return {
    protocolVersion: '0.1.0',
    maxTurns: 200,
    turnTimeoutMs: 60_000,
    maxStdoutBytes: 1024 * 1024,
    maxStderrBytes: 1024 * 1024,
    failurePolicy: 'forfeit',
    maxRetries: 0,
    logRequests: false,
    logResponses: false,
    logStates: false,
    bestOf: 2,
  };
}

function participants(count: number, sdk: { version: string; digest: string }, sourceDigest: string): TournamentParticipant[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index + 1;
    const execution: SourceRevisionExecution = {
      kind: 'source-revision',
      competitorId: `series-qa-competitor-${suffix}`,
      botId: `series-qa-bot-${suffix}`,
      revisionId: `series-qa-revision-${suffix}`,
      runtimeId: 'cpp',
      sourceDigest,
      executionMode: 'strategy',
      sdkVersion: sdk.version,
      sdkDigest: sdk.digest,
    };
    const bot: BotDefinition = {
      botId: execution.botId,
      player: 'A',
      command: 'source-revision',
      args: [],
      execution,
    };
    return {
      participantId: `series-qa-participant-${suffix}`,
      name: execution.botId,
      bot,
      registeredAt: new Date(1000 + index).toISOString(),
    };
  });
}

interface QaStats {
  calls: string[];
  lastGameByPairing: Map<string, number>;
  lastSidesByPairing: Map<string, { playerA: string; playerB: string }>;
  activePairings: Set<string>;
  peakActivePairings: number;
  peakDockerPermits: number;
  prematureAdvancement: boolean;
  checkpoints: MatchSchedulerCheckpoint[];
  limiterEvents: Array<{
    phase: 'admitted' | 'released';
    label: string;
    waitMs: number;
    executionMs: number;
    active: number;
  }>;
}

function createStats(): QaStats {
  return {
    calls: [],
    lastGameByPairing: new Map(),
    lastSidesByPairing: new Map(),
    activePairings: new Set(),
    peakActivePairings: 0,
    peakDockerPermits: 0,
    prematureAdvancement: false,
    checkpoints: [],
    limiterEvents: [],
  };
}

function gameParts(matchId: string): { pairingMatchId: string; gameNumber: number } {
  const match = matchId.match(/^(.*)-g([123])$/);
  return match
    ? { pairingMatchId: match[1]!, gameNumber: Number(match[2]) }
    : { pairingMatchId: matchId, gameNumber: 0 };
}

function findPairing(tournament: Tournament, pairingMatchId: string): TournamentPairing | undefined {
  return getAllTournamentPairings(tournament).find(pairing => pairing.matchId === pairingMatchId);
}

class CrashAfterAggregateRepository extends FileTournamentRepository {
  private failNextSave = false;
  private injected = false;

  override async saveMatchResult(...args: Parameters<FileTournamentRepository['saveMatchResult']>): Promise<void> {
    await super.saveMatchResult(...args);
    const matchId = args[1];
    if (!this.injected && !/-g[123]$/.test(matchId)) {
      this.injected = true;
      this.failNextSave = true;
    }
  }

  override async save(tournament: Tournament): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('injected crash after durable series aggregate');
    }
    await super.save(tournament);
  }
}

interface QaContext {
  root: string;
  repository: FileTournamentRepository;
  manager: TournamentManager;
  tournament: Tournament;
  limiter: DockerExecutionLimiter;
  stats: QaStats;
  releaseRevisionScopes: string[];
  sourceByRevision: Map<string, Buffer>;
}

const QA_RUN_TIMEOUT_MS = 540_000;
const QA_DRAIN_TIMEOUT_MS = 45_000;

async function runWithAbortAndDrain(
  context: QaContext,
): Promise<Awaited<ReturnType<TournamentManager['runAllMatches']>>> {
  const controller = new AbortController();
  const runPromise = context.manager.runAllMatches(context.tournament.tournamentId, controller.signal);
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error(`QA scheduler deadline exceeded after ${QA_RUN_TIMEOUT_MS}ms`));
        reject(new Error(`QA scheduler deadline exceeded after ${QA_RUN_TIMEOUT_MS}ms`));
      }, QA_RUN_TIMEOUT_MS);
    });
    return await Promise.race([runPromise, timeoutPromise]);
  } catch (error) {
    if (!timedOut) throw error;

    const drained = await Promise.race([
      runPromise.then(() => true, () => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), QA_DRAIN_TIMEOUT_MS)),
    ]);
    if (!drained) {
      throw new Error(
        `QA scheduler did not drain within ${QA_DRAIN_TIMEOUT_MS}ms after cancellation; ` +
        `limiter active=${context.limiter.active}, pending=${context.limiter.pending}, ` +
        `last checkpoints=${JSON.stringify(context.stats.checkpoints.slice(-4))}`,
      );
    }
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function createContext(
  count: number,
  repository: FileTournamentRepository,
  root: string,
  stats = createStats(),
  schedulerConcurrency: 1 | 2 = 2,
  fixtureSeed = '',
): Promise<QaContext> {
  const sdk = await getStrategySdkIdentity('cpp');
  const sourceDigest = createHash('sha256').update(CPP_SOURCE).digest('hex');
  const tournamentId = `qa-series-${randomUUID().replaceAll('-', '')}`;
  const tournamentParticipants = participants(count, sdk, sourceDigest);
  const tournament = createMultiStageTournament({
    tournamentId,
    name: count === 4 ? 'QA BO2 Group' : 'QA BO3 Elimination',
    participants: tournamentParticipants,
    matchConfig: matchConfig(),
    options: {},
  });
  tournament.status = 'running';
  tournament.startedAt = new Date().toISOString();
  if (fixtureSeed) {
    for (const pairing of getAllTournamentPairings(tournament)) {
      if (pairing.participantB === null) continue;
      const stage = tournament.stages?.find(candidate => candidate.stageId === pairing.stageId);
      const format = stage?.stageType === 'group_stage' ? 'bo2' : 'bo3';
      pairing.seriesProgress = {
        format,
        bestOf: format === 'bo2' ? 2 : 3,
        seed: `${fixtureSeed}:${pairing.pairingId}`,
        nextGame: 1,
        winsA: 0,
        winsB: 0,
        games: [],
      };
    }
  }
  await repository.initialize();
  await repository.save(tournament);

  const limiter = new DockerExecutionLimiter(1, {
    onAdmitted: event => {
      stats.peakDockerPermits = Math.max(stats.peakDockerPermits, event.active);
      stats.limiterEvents.push({ ...event, phase: 'admitted', executionMs: 0 });
    },
    onReleased: event => stats.limiterEvents.push({ ...event, phase: 'released' }),
  });
  const releaseRevisionScopes: string[] = [];
  const revisionExecutor = createRevisionDockerExecutor({
    imageRegistry: configuredQaRegistry(),
    executionPolicy: 'sandbox-required',
    resourceEnvironment: 'qa',
    storageNamespace: `series-qa-${randomUUID().replaceAll('-', '')}`,
    serverInstanceId: `vitest-series-${process.pid}-${randomUUID().replaceAll('-', '')}`,
    ownerLeaseTtlMs: 5_000,
    workingDirBase: path.join(root, 'work'),
    cppCompilationBackend: 'ephemeral-volume',
    defaultPreparationTimeoutMs: 20_000,
    defaultCompileTimeoutMs: 60_000,
    defaultTimeoutMs: 60_000,
    dockerExecutionLimiter: limiter,
  });
  const originalRelease = revisionExecutor.releaseRevisionScope.bind(revisionExecutor);
  const trackedRevisionExecutor = new Proxy(revisionExecutor, {
    get(target, property, receiver) {
      if (property === 'releaseRevisionScope') {
        return async (scopeId: string) => {
          releaseRevisionScopes.push(scopeId);
          return originalRelease(scopeId);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const sourceByRevision = new Map(
    tournamentParticipants.map(participant => {
      const execution = participant.bot.execution as SourceRevisionExecution;
      return [`${execution.botId}:${execution.revisionId}`, CPP_SOURCE] as const;
    }),
  );
  const resolveRevision = async (execution: SourceRevisionExecution) =>
    sourceByRevision.get(`${execution.botId}:${execution.revisionId}`) ?? null;
  const rawExecutor = await createMatchRunnerExecutor(
    matchConfig() as Partial<MatchConfig>,
    undefined,
    trackedRevisionExecutor,
    resolveRevision,
  );
  const managerExecutor: MatchExecutor = {
    isAvailable: () => rawExecutor.isAvailable(),
    async executeMatch(matchId, playerA, playerB, config, callbacks, signal) {
      const { pairingMatchId, gameNumber } = gameParts(matchId);
      const fresh = await repository.load(tournamentId);
      const pairing = fresh && findPairing(fresh, pairingMatchId);
      if (!pairing || pairing.status !== 'in_progress') {
        throw new Error(`QA durable claim missing for ${matchId}`);
      }
      const previousGame = stats.lastGameByPairing.get(pairingMatchId) ?? 0;
      if (gameNumber !== previousGame + 1) {
        throw new Error(`Series games were not sequential for ${pairingMatchId}: ${previousGame} -> ${gameNumber}`);
      }
      const previousSides = stats.lastSidesByPairing.get(pairingMatchId);
      if (previousSides && gameNumber === 2 &&
          (playerA.botId !== previousSides.playerB || playerB.botId !== previousSides.playerA)) {
        throw new Error(`Game 2 sides did not alternate for ${pairingMatchId}`);
      }
      if (gameNumber === 3) {
        const seed = pairing.seriesProgress?.seed;
        if (!seed || pairing.participantB === null) {
          throw new Error(`Game 3 is missing persisted series seed or participant B for ${pairingMatchId}`);
        }
        const expected = getSeriesSides(seed, 3, pairing.participantA, pairing.participantB);
        const expectedA = fresh.participants.find(participant => participant.participantId === expected.playerA)?.bot.botId;
        const expectedB = fresh.participants.find(participant => participant.participantId === expected.playerB)?.bot.botId;
        if (playerA.botId !== expectedA || playerB.botId !== expectedB) {
          throw new Error(
            `Game 3 sides did not match deterministic seed for ${pairingMatchId}: ` +
            `seed=${seed}, expected=${expectedA}/${expectedB}, actual=${playerA.botId}/${playerB.botId}`,
          );
        }
      }
      stats.lastGameByPairing.set(pairingMatchId, gameNumber);
      stats.lastSidesByPairing.set(pairingMatchId, { playerA: playerA.botId, playerB: playerB.botId });
      if (stats.calls.includes(matchId)) throw new Error(`Duplicate Docker game execution: ${matchId}`);
      stats.calls.push(matchId);
      stats.activePairings.add(pairingMatchId);
      stats.peakActivePairings = Math.max(stats.peakActivePairings, stats.activePairings.size);

      const stage = fresh.stages?.find(candidate => candidate.stageId === pairing.stageId);
      if (stage?.stageType === 'knockout') {
        const groupStage = fresh.stages?.find(candidate => candidate.stageType === 'group_stage');
        const groupPairings = groupStage?.groups?.flatMap(group => group.rounds.flatMap(round => round.pairings)) ?? [];
        if (groupPairings.some(candidate => candidate.participantB !== null && candidate.status !== 'completed')) {
          stats.prematureAdvancement = true;
        }
      }
      try {
        return await rawExecutor.executeMatch(matchId, playerA, playerB, config, callbacks, signal);
      } finally {
        stats.activePairings.delete(pairingMatchId);
      }
    },
  };
  const manager = new TournamentManager({
    repository,
    executor: managerExecutor,
    enableMultiStage: true,
    enableBo1MatchScheduler: true,
    qaMaxActiveMatches: schedulerConcurrency,
    onBo1SchedulerCheckpoint: checkpoint => {
      stats.checkpoints.push(checkpoint);
      if (process.env.OTT_RUN_SERIES_DOCKER_QA === 'true') {
        process.stdout.write(`SERIES_SCHEDULER_CHECKPOINT ${JSON.stringify(checkpoint)}\n`);
      }
    },
  });
  return { root, repository, manager, tournament, limiter, stats, releaseRevisionScopes, sourceByRevision };
}

function assertDurableTriad(root: string, tournamentId: string, matchId: string): Promise<void> {
  return fs.access(path.join(root, 'storage', tournamentId, `match-${matchId}.commit.json`));
}

async function summarizeSeriesRun(
  context: QaContext,
  startedAt: number,
  run: Awaited<ReturnType<TournamentManager['runAllMatches']>>,
  concurrency: 1 | 2,
) {
  const final = await context.repository.load(context.tournament.tournamentId);
  if (!final) throw new Error(`Missing final tournament ${context.tournament.tournamentId}`);
  const pairings = getAllTournamentPairings(final).filter(pairing => pairing.participantB !== null);
  const aggregateRecords = await context.repository.listMatchResults(context.tournament.tournamentId);
  const normalizedSeries = pairings.map(pairing => ({
    pairingId: pairing.pairingId,
    stageType: final.stages?.find(stage => stage.stageId === pairing.stageId)?.stageType ?? null,
    status: pairing.status,
    winner: pairing.matchResult?.series?.winner ?? null,
    games: (pairing.matchResult?.series?.games ?? []).map(game => ({
      gameNumber: game.gameNumber,
      participantA: game.participantA,
      participantB: game.participantB,
      winnerParticipantId: game.winnerParticipantId,
    })),
  }));
  let gameCount = 0;
  for (const pairing of pairings) {
    const games = pairing.matchResult?.series?.games ?? [];
    gameCount += games.length;
    await assertDurableTriad(context.root, context.tournament.tournamentId, pairing.matchId!);
    expect(await context.repository.loadMatchResult(context.tournament.tournamentId, pairing.matchId!)).not.toBeNull();
    expect(await context.repository.loadReplay(context.tournament.tournamentId, pairing.matchId!)).not.toBeNull();
    for (const game of games) {
      const persistedGame = await context.repository.loadMatchResult(context.tournament.tournamentId, game.matchId);
      expect(persistedGame?.seriesGameOf).toBe(pairing.matchId);
      expect((await context.repository.loadReplay(context.tournament.tournamentId, game.matchId))?.matchId).toBe(game.matchId);
      await assertDurableTriad(context.root, context.tournament.tournamentId, game.matchId);
    }
  }
  const released = context.stats.limiterEvents.filter(event => event.phase === 'released');
  return {
    concurrency,
    elapsedMs: Date.now() - startedAt,
    peakActivePairings: context.stats.peakActivePairings,
    peakDockerPermits: context.stats.peakDockerPermits,
    permitWaitMs: released.map(event => event.waitMs),
    permitExecutionMs: released.map(event => event.executionMs),
    pairingCount: pairings.length,
    gameCount,
    aggregateRecordCount: aggregateRecords.length,
    tournamentStatus: final.status,
    stageStatuses: final.stages?.map(stage => `${stage.stageId}:${stage.status}`) ?? [],
    normalizedSeries,
    replayCommitChecks: aggregateRecords.length + gameCount,
    failures: run.success ? [] : [run.error ?? 'unknown tournament failure'],
    cleanup: { active: context.limiter.active, pending: context.limiter.pending },
    schedulerCheckpoints: context.stats.checkpoints.length,
  };
}

suite('Series-aware scheduler RevisionDockerExecutor QA', () => {
  const contexts: QaContext[] = [];

  afterEach(async () => {
    for (const context of contexts.splice(0)) {
      if (context.limiter.active !== 0 || context.limiter.pending !== 0) {
        throw new Error(
          `Refusing QA cleanup while Docker workers remain for ${context.tournament.tournamentId}: ` +
          `active=${context.limiter.active}, pending=${context.limiter.pending}`,
        );
      }
      context.manager.close();
      context.repository.close();
      await fs.rm(context.root, { recursive: true, force: true });
    }
  });

  it('runs independent BO2 group pairings at scheduler concurrency 2 while Docker stays globally serial', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-series-docker-qa-'));
    const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
    let context: QaContext;
    try {
      context = await createContext(4, repository, root);
    } catch (error) {
      repository.close();
      await fs.rm(root, { recursive: true, force: true });
      throw error;
    }
    contexts.push(context);

    const run = await runWithAbortAndDrain(context);
    expect(run.success).toBe(true);
    expect(context.stats.peakActivePairings).toBe(2);
    expect(context.stats.peakDockerPermits).toBeLessThanOrEqual(1);
    expect(context.limiter.maxConcurrent).toBe(1);
    expect(context.stats.calls.length).toBeGreaterThan(0);
    expect(new Set(context.stats.calls).size).toBe(context.stats.calls.length);
    expect(context.stats.prematureAdvancement).toBe(false);
    expect(context.stats.checkpoints.some(checkpoint => checkpoint.phase === 'dispatch')).toBe(true);
    expect(context.stats.checkpoints.some(checkpoint => checkpoint.activePairingIds.length === 2)).toBe(true);

    const final = await repository.load(context.tournament.tournamentId);
    expect(final?.stages?.every(stage => stage.status === 'completed')).toBe(true);
    const groupStage = final!.stages!.find(stage => stage.stageType === 'group_stage')!;
    const groupPairings = groupStage.groups!.flatMap(group => group.rounds.flatMap(round => round.pairings))
      .filter(pairing => pairing.participantB !== null);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.format === 'bo2')).toBe(true);
    expect(groupPairings.every(pairing => Boolean(pairing.matchResult?.series?.games))).toBe(true);
    for (const pairing of groupPairings) {
      expect(pairing.matchResult?.series?.games).toHaveLength(2);
      for (const game of pairing.matchResult!.series!.games) {
        expect(await repository.loadMatchResult(context.tournament.tournamentId, game.matchId)).not.toBeNull();
        expect(await repository.loadReplay(context.tournament.tournamentId, game.matchId)).not.toBeNull();
        await assertDurableTriad(context.root, context.tournament.tournamentId, game.matchId);
      }
      await assertDurableTriad(context.root, context.tournament.tournamentId, pairing.matchId!);
    }

    const aggregateRecords = (await repository.listMatchResults(context.tournament.tournamentId))
      .filter(record => !record.seriesGameOf);
    for (const group of groupStage.groups!) {
      const groupRecords = groupPairings
        .filter(pairing => group.participantIds.includes(pairing.participantA) && pairing.matchResult)
        .map(pairing => pairing.matchResult!);
      const expected = computeStandings(final!.participants, groupRecords, final!.scoringConfig);
      const expectedById = new Map(expected.map(standing => [standing.participantId, standing]));
      for (const actual of group.standings) {
        expect(actual).toMatchObject({
          participantId: actual.participantId,
          points: expectedById.get(actual.participantId)?.points,
          matchesPlayed: expectedById.get(actual.participantId)?.matchesPlayed,
          wins: expectedById.get(actual.participantId)?.wins,
          draws: expectedById.get(actual.participantId)?.draws,
          losses: expectedById.get(actual.participantId)?.losses,
        });
      }
    }
    expect(aggregateRecords.every(record => !record.seriesGameOf)).toBe(true);
    expect(context.releaseRevisionScopes.length).toBeGreaterThan(0);
    expect(getAllTournamentPairings(final!).every(pairing => pairing.status !== 'in_progress')).toBe(true);
  }, QA_RUN_TIMEOUT_MS + QA_DRAIN_TIMEOUT_MS + 15_000);

  it('runs an elimination BO3 to Game 3 and recovers a crash using only the aggregate record', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-series-docker-crash-'));
    const repository = new CrashAfterAggregateRepository({ baseDir: path.join(root, 'storage') });
    let context: QaContext;
    try {
      context = await createContext(2, repository, root);
    } catch (error) {
      repository.close();
      await fs.rm(root, { recursive: true, force: true });
      throw error;
    }
    contexts.push(context);

    const run = await runWithAbortAndDrain(context);
    expect(run.success).toBe(false);
    const records = await repository.listMatchResults(context.tournament.tournamentId);
    const aggregate = records.find(record => !record.seriesGameOf);
    expect(aggregate?.series?.format).toBe('bo3');
    expect(aggregate?.series?.games).toHaveLength(3);
    // listMatchResults intentionally exposes only aggregate records to standings
    // consumers. Per-game durability is verified through direct artifact loads.
    expect(records).toHaveLength(1);
    expect(records.every(record => !record.seriesGameOf)).toBe(true);
    expect(records[0]?.matchId).toBe(aggregate?.matchId);
    for (const game of aggregate!.series!.games) {
      expect((await repository.loadMatchResult(context.tournament.tournamentId, game.matchId))?.seriesGameOf)
        .toBe(aggregate!.matchId);
      expect((await repository.loadReplay(context.tournament.tournamentId, game.matchId)).matchId).toBe(game.matchId);
      await assertDurableTriad(context.root, context.tournament.tournamentId, game.matchId);
    }
    await assertDurableTriad(context.root, context.tournament.tournamentId, aggregate!.matchId);

    const recoveredExecutor: MatchExecutor = {
      async executeMatch() {
        throw new Error('Recovery re-executed a committed series game');
      },
      async isAvailable() { return true; },
    };
    const restarted = new TournamentManager({ repository, executor: recoveredExecutor, enableMultiStage: true, enableBo1MatchScheduler: true, qaMaxActiveMatches: 2 });
    expect((await restarted.recoverInterruptedTournaments())).toBe(1);
    const recovered = await repository.load(context.tournament.tournamentId);
    expect(recovered?.stages?.every(stage => stage.status === 'completed')).toBe(true);
    expect(getAllTournamentPairings(recovered!).every(pairing => pairing.status !== 'in_progress')).toBe(true);
    const expectedStandings = computeStandings(
      recovered!.participants,
      [aggregate!],
      recovered!.scoringConfig,
    );
    expect(recovered!.standings).toEqual(expectedStandings);
    restarted.close();
  }, QA_RUN_TIMEOUT_MS + QA_DRAIN_TIMEOUT_MS + 15_000);

  it('benchmarks the same seeded BO2/BO3 fixture sequentially at scheduler concurrency 1 and 2', async () => {
    const fixtureSeed = 'series-concurrency-comparison-fixture-v1';
    const summaries: Array<Awaited<ReturnType<typeof summarizeSeriesRun>>> = [];
    for (const schedulerConcurrency of parseComparisonOrder()) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `ott-series-concurrency-${schedulerConcurrency}-`));
      const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
      let context: QaContext;
      try {
        context = await createContext(4, repository, root, createStats(), schedulerConcurrency, fixtureSeed);
      } catch (error) {
        repository.close();
        await fs.rm(root, { recursive: true, force: true });
        throw error;
      }
      contexts.push(context);
      const startedAt = Date.now();
      const run = await runWithAbortAndDrain(context);
      summaries.push(await summarizeSeriesRun(context, startedAt, run, schedulerConcurrency));

      expect(run.success).toBe(true);
      expect(context.stats.calls.length).toBe(summaries.at(-1)!.gameCount);
      expect(new Set(context.stats.calls).size).toBe(context.stats.calls.length);
      expect(summaries.at(-1)!.failures).toEqual([]);
      expect(summaries.at(-1)!.cleanup).toEqual({ active: 0, pending: 0 });
      expect(summaries.at(-1)!.tournamentStatus).toBe('completed');
      expect(summaries.at(-1)!.peakActivePairings).toBeLessThanOrEqual(schedulerConcurrency);
      expect(summaries.at(-1)!.peakDockerPermits).toBeLessThanOrEqual(1);
      expect(summaries.at(-1)!.schedulerCheckpoints).toBeGreaterThan(0);
      expect(summaries.at(-1)!.stageStatuses.every(status => status.endsWith(':completed'))).toBe(true);
      expect(summaries.at(-1)!.permitWaitMs.every(value => value >= 0)).toBe(true);
      expect(summaries.at(-1)!.permitExecutionMs.every(value => value > 0)).toBe(true);
      expect(summaries.at(-1)!.normalizedSeries.every(series =>
        series.status === 'completed' && series.games.length >= 2 &&
        (series.stageType === 'group_stage' ? series.games.length === 2 : series.games.length <= 3),
      )).toBe(true);
    }

    const serial = summaries.find(summary => summary.concurrency === 1);
    const parallel = summaries.find(summary => summary.concurrency === 2);
    expect(serial).toBeDefined();
    expect(parallel).toBeDefined();
    expect(serial!.normalizedSeries).toEqual(parallel!.normalizedSeries);
    expect(serial!.pairingCount).toBe(parallel!.pairingCount);
    expect(serial!.gameCount).toBe(parallel!.gameCount);
    expect(serial!.aggregateRecordCount).toBe(serial!.pairingCount);
    expect(parallel!.aggregateRecordCount).toBe(parallel!.pairingCount);
    expect(serial!.replayCommitChecks).toBe(serial!.pairingCount + serial!.gameCount);
    expect(parallel!.replayCommitChecks).toBe(parallel!.pairingCount + parallel!.gameCount);
    expect(serial!.elapsedMs).toBeGreaterThan(0);
    expect(parallel!.elapsedMs).toBeGreaterThan(0);
    process.stdout.write(`SERIES_CONCURRENCY_COMPARISON ${JSON.stringify({
      fixtureSeed,
      dockerExecutionBudget: 1,
      sequential: { concurrency: 1, ...serial },
      parallel: { concurrency: 2, ...parallel },
    })}\n`);
  }, 1_200_000);
});

describe('Series scheduler deterministic draw contract', () => {
  it('accepts only the two QA comparison orders', () => {
    expect(parseComparisonOrder('1,2')).toEqual([1, 2]);
    expect(parseComparisonOrder('2,1')).toEqual([2, 1]);
    expect(parseComparisonOrder('')).toEqual([...DEFAULT_COMPARISON_ORDER]);
    expect(() => parseComparisonOrder('1,1')).toThrow(/1,2 or 2,1/);
    expect(() => parseComparisonOrder('2,3')).toThrow(/1,2 or 2,1/);
  });

  it('keeps an undecided elimination Game 3 series pending_tiebreaker without Docker', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-series-draw-contract-'));
    const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
    try {
      const tournamentId = 'series-draw-contract';
      const tournamentParticipants: TournamentParticipant[] = [1, 2].map(index => ({
        participantId: `draw-p${index}`,
        name: `Draw P${index}`,
        bot: { botId: `draw-b${index}`, player: 'A' as const, command: 'mock', args: [] },
        registeredAt: new Date(1000 + index).toISOString(),
      }));
      const tournament = createMultiStageTournament({
        tournamentId,
        name: 'Draw contract',
        participants: tournamentParticipants,
        matchConfig: matchConfig(),
        options: {},
      });
      tournament.status = 'running';
      await repository.initialize();
      await repository.save(tournament);
      const executor: MatchExecutor = {
        async executeMatch(matchId, playerA, playerB): Promise<MatchResult> {
          return {
            matchId, protocolVersion: '0.1.0', status: 'finished', winner: 'draw',
            terminationReason: 'max_turns', turnCount: 200, durationMs: 1,
            startTime: new Date(0).toISOString(), endTime: new Date(1).toISOString(),
            playerA, playerB,
            initialState: { turn: 0, currentPlayer: 'A', status: 'playing', winner: null, winReason: null, pieces: [], lastMove: null, positionHistory: [] },
            finalState: { turn: 200, currentPlayer: 'A', status: 'finished', winner: null, winReason: 'max_turns', pieces: [], lastMove: null, positionHistory: [] },
            turnLog: [],
          };
        },
        async isAvailable() { return true; },
      };
      const manager = new TournamentManager({ repository, executor, enableMultiStage: true, enableBo1MatchScheduler: true, qaMaxActiveMatches: 2 });
      const result = await manager.runAllMatches(tournamentId);
      expect(result.success).toBe(false);
      const saved = await repository.load(tournamentId);
      const pairing = getAllTournamentPairings(saved!).find(candidate => candidate.participantB !== null)!;
      expect(pairing.status).toBe('pending_tiebreaker');
      expect(pairing.tiebreakerStatus).toBe('pending');
      expect(pairing.seriesProgress?.games).toHaveLength(3);
      const records = await repository.listMatchResults(tournamentId);
      expect(records).toHaveLength(1);
      expect(records[0]?.series?.games).toHaveLength(3);
      expect(records.every(record => !record.seriesGameOf)).toBe(true);
      for (const game of pairing.seriesProgress!.games) {
        expect((await repository.loadMatchResult(tournamentId, game.matchId))?.seriesGameOf)
          .toBe(pairing.matchId);
        expect((await repository.loadReplay(tournamentId, game.matchId)).matchId).toBe(game.matchId);
        await assertDurableTriad(root, tournamentId, game.matchId);
      }
    } finally {
      repository.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
