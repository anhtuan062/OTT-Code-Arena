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
const PYTHON_SOURCE = Buffer.from(
  'def choose_move(state, legal_moves):\n    return legal_moves[0]\n',
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

function matchConfig(maxTurns = 200): Tournament['matchConfig'] {
  return {
    protocolVersion: '0.1.0',
    maxTurns,
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

function participants(
  count: number,
  sdk: { version: string; digest: string },
  sourceDigest: string,
  runtimeId: 'cpp' | 'python3',
  profiles?: Partial<Record<'cpp' | 'python3', { sdk: { version: string; digest: string }; sourceDigest: string }>>,
  runtimeIds: Array<'cpp' | 'python3'> = [],
): TournamentParticipant[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = index + 1;
    const selectedRuntimeId = runtimeIds[index] ?? runtimeId;
    const selectedProfile = profiles?.[selectedRuntimeId];
    const execution: SourceRevisionExecution = {
      kind: 'source-revision',
      competitorId: `series-qa-competitor-${suffix}`,
      botId: `series-qa-bot-${suffix}`,
      revisionId: `series-qa-revision-${suffix}`,
      runtimeId: selectedRuntimeId,
      sourceDigest: selectedProfile?.sourceDigest ?? sourceDigest,
      executionMode: 'strategy',
      sdkVersion: selectedProfile?.sdk.version ?? sdk.version,
      sdkDigest: selectedProfile?.sdk.digest ?? sdk.digest,
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
  peakDockerActive: number;
  peakDockerPending: number;
  peakHeapUsedBytes: number;
  cpuStartUsage: NodeJS.CpuUsage;
  prematureAdvancement: boolean;
  checkpoints: MatchSchedulerCheckpoint[];
  limiterEvents: Array<{
    phase: 'admitted' | 'released';
    label: string;
    waitMs: number;
    executionMs: number;
    active: number;
  }>;
  turnMetrics: Array<{ matchId: string; totalMs: number; readinessMs: number; compilationMs: number | null; lifecycleMs: number; cleanupMs: number; cleanupSucceeded: boolean }>;
  pairingStarts: Map<string, number>;
  pairingEnds: Map<string, number>;
}

function createStats(): QaStats {
  return {
    calls: [],
    lastGameByPairing: new Map(),
    lastSidesByPairing: new Map(),
    activePairings: new Set(),
    peakActivePairings: 0,
    peakDockerPermits: 0,
    peakDockerActive: 0,
    peakDockerPending: 0,
    peakHeapUsedBytes: process.memoryUsage().heapUsed,
    cpuStartUsage: process.cpuUsage(),
    prematureAdvancement: false,
    checkpoints: [],
    limiterEvents: [],
    turnMetrics: [],
    pairingStarts: new Map(),
    pairingEnds: new Map(),
  };
}

interface BenchmarkExecutorOptions {
  runtimeId: 'cpp' | 'python3';
  availability: 'baseline' | 'cached';
  artifactCache: boolean;
  turnBudget?: number;
  cacheRoot?: string;
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
  benchmarkOptions: BenchmarkExecutorOptions;
  dockerConcurrency: 1 | 2;
}

const QA_RUN_TIMEOUT_MS = 540_000;
const QA_DRAIN_TIMEOUT_MS = 45_000;
const BENCHMARK_CASE_TIMEOUT_MS = 180_000;
const BENCHMARK_CASE_DRAIN_TIMEOUT_MS = 30_000;

async function runPairingWithDeadline(
  context: QaContext,
  pairingId: string,
  timeoutMs = BENCHMARK_CASE_TIMEOUT_MS,
): Promise<Awaited<ReturnType<TournamentManager['runPairingById']>>> {
  const runPromise = context.manager.runPairingById(context.tournament.tournamentId, pairingId);
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new Error(`QA benchmark case deadline exceeded after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return await Promise.race([runPromise, timeoutPromise]);
  } catch (error) {
    if (!timedOut) throw error;
    const drained = await Promise.race([
      runPromise.then(() => true, () => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), BENCHMARK_CASE_DRAIN_TIMEOUT_MS)),
    ]);
    if (!drained) {
      throw new Error(
        `QA benchmark case did not drain within ${BENCHMARK_CASE_DRAIN_TIMEOUT_MS}ms; ` +
        `limiter active=${context.limiter.active}, pending=${context.limiter.pending}`,
      );
    }
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

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
  benchmarkOptions: BenchmarkExecutorOptions = { runtimeId: 'cpp', availability: 'cached', artifactCache: false },
  dockerConcurrency: 1 | 2 = schedulerConcurrency,
  fixtureKind: 'standard' | 'two-bo3' = 'standard',
): Promise<QaContext> {
  const sdk = await getStrategySdkIdentity(benchmarkOptions.runtimeId);
  const source = benchmarkOptions.runtimeId === 'cpp' ? CPP_SOURCE : PYTHON_SOURCE;
  const sourceDigest = createHash('sha256').update(source).digest('hex');
  const tournamentId = `qa-series-${randomUUID().replaceAll('-', '')}`;
  const mixedProfiles = fixtureKind === 'two-bo3'
    ? {
        cpp: {
          sdk: await getStrategySdkIdentity('cpp'),
          sourceDigest: createHash('sha256').update(CPP_SOURCE).digest('hex'),
        },
        python3: {
          sdk: await getStrategySdkIdentity('python3'),
          sourceDigest: createHash('sha256').update(PYTHON_SOURCE).digest('hex'),
        },
      }
    : undefined;
  const tournamentParticipants = fixtureKind === 'two-bo3'
    ? participants(4, mixedProfiles!.cpp.sdk, mixedProfiles!.cpp.sourceDigest, 'cpp', mixedProfiles, ['cpp', 'python3', 'cpp', 'python3'])
    : participants(count, sdk, sourceDigest, benchmarkOptions.runtimeId);
  const tournament = createMultiStageTournament({
    tournamentId,
    name: fixtureKind === 'two-bo3' ? 'QA Two BO3 Pairings' : count === 4 ? 'QA BO2 Group' : 'QA BO3 Elimination',
    participants: tournamentParticipants,
      matchConfig: matchConfig(benchmarkOptions.turnBudget ?? 200),
    options: {},
  });
  tournament.status = 'running';
  tournament.startedAt = new Date().toISOString();
  if (fixtureKind === 'two-bo3') {
    const groupStage = tournament.stages?.find(stage => stage.stageType === 'group_stage');
    const group = groupStage?.groups?.[0];
    const independentPairings = group?.rounds
      .flatMap(round => round.pairings)
      .filter(pairing => pairing.participantB !== null)
      .slice(0, 2) ?? [];
    if (!groupStage || !group || independentPairings.length !== 2) {
      throw new Error('QA two-BO3 fixture could not create two independent pairings');
    }
    group.rounds = [{ roundNumber: 1, pairings: independentPairings }];
    group.status = 'in_progress';
    groupStage.status = 'in_progress';
    tournament.stages = [groupStage];
    for (const pairing of independentPairings) {
      pairing.status = 'scheduled';
      pairing.matchId = null;
      pairing.matchResult = null;
      pairing.startedAt = null;
      pairing.completedAt = null;
      pairing.seriesProgress = {
        format: 'bo3',
        bestOf: 3,
        seed: `two-bo3:${pairing.pairingId}`,
        nextGame: 1,
        winsA: 0,
        winsB: 0,
        games: [],
      };
    }
  }
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

  let limiter: DockerExecutionLimiter;
  limiter = new DockerExecutionLimiter(dockerConcurrency, {
    onAdmitted: event => {
      stats.peakDockerPermits = Math.max(stats.peakDockerPermits, event.active);
      stats.peakDockerActive = Math.max(stats.peakDockerActive, event.active);
      stats.peakDockerPending = Math.max(stats.peakDockerPending, limiter.pending);
      stats.limiterEvents.push({ ...event, phase: 'admitted', executionMs: 0 });
    },
    onReleased: event => {
      stats.peakDockerPending = Math.max(stats.peakDockerPending, limiter.pending);
      stats.limiterEvents.push({ ...event, phase: 'released' });
    },
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
    cppEphemeralArtifactCache: benchmarkOptions.artifactCache,
    compiledArtifactCacheDir: benchmarkOptions.cacheRoot,
    defaultPreparationTimeoutMs: 20_000,
    defaultCompileTimeoutMs: 60_000,
    defaultTimeoutMs: 60_000,
    dockerExecutionLimiter: limiter,
  });
  if (benchmarkOptions.availability === 'baseline') {
    const originalAvailability = revisionExecutor.isAvailable.bind(revisionExecutor);
    (revisionExecutor as any).isAvailable = async (runtimeId?: 'cpp' | 'python3') => {
      (revisionExecutor as any).invalidateAvailability(runtimeId);
      return originalAvailability(runtimeId);
    };
  }
  const originalExecuteRevision = revisionExecutor.executeRevision.bind(revisionExecutor);
  (revisionExecutor as any).executeRevision = async (...args: Parameters<typeof revisionExecutor.executeRevision>) => {
    const result = await originalExecuteRevision(...args);
    stats.peakHeapUsedBytes = Math.max(stats.peakHeapUsedBytes, process.memoryUsage().heapUsed);
    const timings = result.timings;
    const executionContext = args[0] as { matchId?: string };
    stats.turnMetrics.push({
      matchId: executionContext.matchId ?? 'unknown',
      totalMs: result.durationMs,
      readinessMs: timings.imageReadinessMs,
      compilationMs: timings.compilationContainerMs,
      lifecycleMs: (timings.workspacePreparationMs ?? 0) + (timings.artifactValidationMs ?? 0) + timings.cleanupMs,
      cleanupMs: timings.cleanupMs,
      cleanupSucceeded: timings.cleanupSucceeded,
    });
    return result;
  };
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
  const sourceByRuntime = new Map<'cpp' | 'python3', Buffer>([
    ['cpp', CPP_SOURCE],
    ['python3', PYTHON_SOURCE],
  ]);
  const sourceByRevision = new Map(
    tournamentParticipants.map(participant => {
      const execution = participant.bot.execution as SourceRevisionExecution;
      return [`${execution.botId}:${execution.revisionId}`, sourceByRuntime.get(execution.runtimeId) ?? source] as const;
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
      stats.pairingStarts.set(pairingMatchId, stats.pairingStarts.get(pairingMatchId) ?? performance.now());
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
        stats.pairingEnds.set(pairingMatchId, performance.now());
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
  return { root, repository, manager, tournament, limiter, stats, releaseRevisionScopes, sourceByRevision, benchmarkOptions, dockerConcurrency };
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
    peakDockerActive: context.stats.peakDockerActive,
    peakDockerPending: context.stats.peakDockerPending,
    processCpuUserMs: process.cpuUsage(context.stats.cpuStartUsage).user / 1000,
    peakHeapUsedBytes: context.stats.peakHeapUsedBytes,
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

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
}

function summarizeEndToEndPerformance(context: QaContext, startedAt: number, run: Awaited<ReturnType<TournamentManager['runAllMatches']>>) {
  const turns = context.stats.turnMetrics;
  const pairingDurations = [...context.stats.pairingStarts.entries()]
    .map(([pairingId, start]) => ({ pairingId, durationMs: (context.stats.pairingEnds.get(pairingId) ?? performance.now()) - start }));
  const total = turns.map(turn => turn.totalMs);
  const compilation = turns.flatMap(turn => turn.compilationMs === null ? [] : [turn.compilationMs]);
  const lifecycle = turns.map(turn => turn.lifecycleMs);
  const cacheEligible = context.benchmarkOptions.runtimeId === 'cpp';
  const firstTurnByMatch = new Map<string, typeof turns[number]>();
  for (const turn of turns) if (!firstTurnByMatch.has(turn.matchId)) firstTurnByMatch.set(turn.matchId, turn);
  const cacheProbeTurns = [...firstTurnByMatch.values()];
  const cacheHits = cacheEligible ? cacheProbeTurns.filter(turn => turn.compilationMs === null).length : null;
  const cacheMisses = cacheEligible ? cacheProbeTurns.filter(turn => turn.compilationMs !== null).length : null;
  return {
    runtime: context.benchmarkOptions.runtimeId,
    availability: context.benchmarkOptions.availability,
    p2: context.benchmarkOptions.artifactCache,
    elapsedMs: Date.now() - startedAt,
    runSuccess: run.success,
    pairingCount: pairingDurations.length,
    pairingDurationMs: {
      p50: percentile(pairingDurations.map(item => item.durationMs), 0.50),
      p95: percentile(pairingDurations.map(item => item.durationMs), 0.95),
      samples: pairingDurations.length,
    },
    turnDurationMs: { p50: percentile(total, 0.50), p95: percentile(total, 0.95), samples: total.length },
    compilationMs: { p50: percentile(compilation, 0.50), p95: percentile(compilation, 0.95), samples: compilation.length },
    dockerLifecycleMs: { p50: percentile(lifecycle, 0.50), p95: percentile(lifecycle, 0.95), samples: lifecycle.length },
    availabilityReadinessMs: { p50: percentile(turns.map(turn => turn.readinessMs), 0.50), p95: percentile(turns.map(turn => turn.readinessMs), 0.95) },
    cache: cacheEligible ? { hits: cacheHits, misses: cacheMisses, ratio: (cacheHits! + cacheMisses!) > 0 ? cacheHits! / (cacheHits! + cacheMisses!) : 0 } : null,
    cleanup: { samples: turns.length, failures: turns.filter(turn => !turn.cleanupSucceeded).length, totalMs: turns.reduce((sum, turn) => sum + turn.cleanupMs, 0) },
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

  it('runs two independent BO3 pairings at scheduler and Docker concurrency 2', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-series-docker-qa-'));
    const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
    let context: QaContext;
    try {
      context = await createContext(
        4,
        repository,
        root,
        createStats(),
        2,
        '',
        { runtimeId: 'cpp', availability: 'cached', artifactCache: false },
        2,
        'two-bo3',
      );
    } catch (error) {
      repository.close();
      await fs.rm(root, { recursive: true, force: true });
      throw error;
    }
    contexts.push(context);

    const run = await runWithAbortAndDrain(context);
    expect(run.success).toBe(true);
    expect(context.stats.peakActivePairings).toBe(2);
    expect(context.stats.peakDockerActive).toBe(2);
    expect(context.limiter.maxConcurrent).toBe(2);
    process.stdout.write(`DOCKER_CONCURRENCY_QA ${JSON.stringify({
      schedulerConcurrency: 2,
      dockerConcurrency: context.limiter.maxConcurrent,
      peakDockerActive: context.stats.peakDockerActive,
      peakDockerPending: context.stats.peakDockerPending,
      duplicateClaims: context.stats.calls.length - new Set(context.stats.calls).size,
    })}\n`);
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
    expect(groupPairings).toHaveLength(2);
    expect(groupPairings.every(pairing => pairing.matchResult?.series?.format === 'bo3')).toBe(true);
    expect(groupPairings.every(pairing => Boolean(pairing.matchResult?.series?.games))).toBe(true);
    for (const pairing of groupPairings) {
      expect(pairing.matchResult?.series?.games).toHaveLength(3);
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
      expect(summaries.at(-1)!.peakDockerActive).toBe(schedulerConcurrency);
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
    process.stdout.write(`SERIES_CONCURRENCY_TIMING ${JSON.stringify({
      serialMs: serial!.elapsedMs,
      parallelMs: parallel!.elapsedMs,
      speedup: serial!.elapsedMs / parallel!.elapsedMs,
    })}\n`);
    process.stdout.write(`SERIES_CONCURRENCY_COMPARISON ${JSON.stringify({
      fixtureSeed,
      dockerExecutionBudget: 2,
      sequential: { concurrency: 1, ...serial },
      parallel: { concurrency: 2, ...parallel },
    })}\n`);
  }, 1_200_000);

  it('compares baseline, P0-only and P0+P2 on identical isolated BO2/BO3 C++/Python pairings', async () => {
    const allVariants: Array<{ name: string; availability: 'baseline' | 'cached'; artifactCache: boolean }> = [
      { name: 'baseline', availability: 'baseline', artifactCache: false },
      { name: 'p0-only', availability: 'cached', artifactCache: false },
      { name: 'p0-p2', availability: 'cached', artifactCache: true },
    ];
    const fixtures = [
      { name: 'BO2', count: 4 },
      { name: 'BO3', count: 2 },
    ] as const;
    const rows: Array<Record<string, unknown>> = [];
    const bounded = process.env.OTT_P0_P2_BOUNDED_QA === 'true';
    const variants = bounded ? allVariants.filter(variant => variant.name !== 'baseline') : allVariants;
    const runtimes = bounded ? (['cpp'] as const) : (['cpp', 'python3'] as const);
    const fixtureFilter = process.env.OTT_P0_P2_FIXTURE;
    const selectedFixtures = fixtureFilter === 'BO2' || fixtureFilter === 'BO3'
      ? fixtures.filter(fixture => fixture.name === fixtureFilter)
      : fixtures;
    const requestedRepetitions = Number(process.env.OTT_P0_P2_REPETITIONS ?? (bounded ? '3' : '1'));
    const repetitions = Number.isInteger(requestedRepetitions) && requestedRepetitions > 0
      ? Math.min(requestedRepetitions, 3)
      : 1;
    const requestedMaxCases = Number(process.env.OTT_P0_P2_MAX_CASES ?? '12');
    const defaultMaxCases = bounded ? selectedFixtures.length * variants.length * repetitions : 12;
    const maxCases = Number.isInteger(requestedMaxCases) && requestedMaxCases > 0 ? Math.min(requestedMaxCases, 12) : defaultMaxCases;
    process.stdout.write(`P0_P2_MATRIX_START ${JSON.stringify({ expectedCases: bounded ? defaultMaxCases : 12, maxCases, bounded, fixtureFilter: fixtureFilter ?? null, repetitions })}\n`);
    caseLoop: for (const runtimeId of runtimes) {
      for (const fixture of selectedFixtures) {
        for (let repetition = 1; repetition <= repetitions; repetition++) {
          const orderedVariants = repetition % 2 === 1 ? variants : [...variants].reverse();
          for (const variant of orderedVariants) {
          if (rows.length >= maxCases) break caseLoop;
          const caseStartedAt = Date.now();
          process.stdout.write(`P0_P2_CASE_START ${JSON.stringify({ case: rows.length + 1, runtimeId, fixture: fixture.name, variant: variant.name, repetition })}\n`);
          const root = await fs.mkdtemp(path.join(os.tmpdir(), `ott-p0-p2-${runtimeId}-${fixture.name}-${variant.name}-`));
          const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
          let context: QaContext;
          try {
            process.stdout.write(`P0_P2_CASE_PHASE ${JSON.stringify({ case: rows.length + 1, phase: 'setup' })}\n`);
            context = await createContext(
              fixture.count, repository, root, createStats(), 1,
              `p0-p2-identical-${runtimeId}-${fixture.name}`,
              {
                runtimeId,
                availability: variant.availability,
                artifactCache: runtimeId === 'cpp' && variant.artifactCache,
                turnBudget: 20,
                cacheRoot: path.join(root, 'cache'),
              },
            );
          } catch (error) {
            repository.close();
            await fs.rm(root, { recursive: true, force: true });
            throw error;
          }
          contexts.push(context);
          const current = await repository.load(context.tournament.tournamentId);
          expect(current).toBeDefined();
          const initialPairings = getAllTournamentPairings(current!);
          const stageTypeOf = (pairing: TournamentPairing) =>
            current!.stages?.find(stage => stage.stageId === pairing.stageId)?.stageType ?? null;
          const groupPairings = initialPairings.filter(pairing =>
            pairing.participantB !== null && stageTypeOf(pairing) === 'group_stage' && pairing.status === 'scheduled',
          );
          if (fixture.name === 'BO2') expect(groupPairings.length).toBeGreaterThan(0);
          process.stdout.write(`P0_P2_CASE_PHASE ${JSON.stringify({
            case: rows.length + 1,
            phase: 'pairing-selected',
            fixture: fixture.name,
            groupPairingIds: groupPairings.slice(0, 2).map(pairing => pairing.pairingId),
            stageType: fixture.name === 'BO2' ? 'group_stage' : 'scheduler-created-knockout',
            initialStages: initialPairings
              .filter(pairing => pairing.participantB !== null)
              .map(pairing => ({ pairingId: pairing.pairingId, stageType: stageTypeOf(pairing), status: pairing.status })),
          })}\n`);
          const startedAt = Date.now();
          process.stdout.write(`P0_P2_CASE_PHASE ${JSON.stringify({ case: rows.length + 1, phase: 'execute' })}\n`);
          let run: Awaited<ReturnType<TournamentManager['runPairingById']>>;
          try {
            if (fixture.name === 'BO2') {
              expect(groupPairings.length).toBeGreaterThanOrEqual(2);
              run = await runPairingWithDeadline(context, groupPairings[0]!.pairingId);
              const secondRun = await runPairingWithDeadline(context, groupPairings[1]!.pairingId);
              expect(secondRun.success, JSON.stringify(secondRun)).toBe(true);
              run = secondRun;
            } else {
              run = await runWithAbortAndDrain(context) as Awaited<ReturnType<TournamentManager['runPairingById']>>;
            }
          } catch (error) {
            process.stdout.write(`P0_P2_CASE_ERROR ${JSON.stringify({
              case: rows.length + 1,
              error: error instanceof Error ? error.message : String(error),
              elapsedMs: Date.now() - caseStartedAt,
              limiter: { active: context.limiter.active, pending: context.limiter.pending },
              turnSamples: context.stats.turnMetrics.length,
            })}\n`);
            throw error;
          }
          expect(run.success, JSON.stringify(run)).toBe(true);
          const final = await repository.load(context.tournament.tournamentId);
          expect(final).toBeDefined();
          const finalPairings = getAllTournamentPairings(final!);
          if (fixture.name === 'BO2') {
            const completedGroup = finalPairings.filter(pairing =>
              groupPairings.some(selected => selected.pairingId === pairing.pairingId) && pairing.status === 'completed',
            );
            process.stdout.write(`P0_P2_FIXTURE_CHECK ${JSON.stringify(completedGroup.map(pairing => ({
              pairingId: pairing.pairingId,
              status: pairing.status,
              format: pairing.matchResult?.series?.format ?? null,
              gameCount: pairing.matchResult?.series?.games?.length ?? 0,
            })))}\n`);
            expect(completedGroup.every(pairing => pairing.matchResult?.series?.format === 'bo2')).toBe(true);
            expect(completedGroup.every(pairing => pairing.matchResult?.series?.games.length === 2)).toBe(true);
          } else {
            const knockoutPairings = finalPairings.filter(pairing =>
              final!.stages?.find(stage => stage.stageId === pairing.stageId)?.stageType === 'knockout' &&
              pairing.status === 'completed',
            );
            expect(knockoutPairings.length).toBeGreaterThan(0);
            for (const knockout of knockoutPairings) {
              const games = knockout.matchResult?.series?.games ?? [];
              expect(games.length).toBeGreaterThanOrEqual(2);
              expect(games.length).toBeLessThanOrEqual(3);
              const firstTwoDifferent = games.length >= 2 && games[0]!.winnerParticipantId !== games[1]!.winnerParticipantId;
              expect(games.length).toBe(firstTwoDifferent ? 3 : 2);
            }
          }
          const performance = summarizeEndToEndPerformance(context, startedAt, run);
          const row = {
            case: rows.length + 1,
            fixture: fixture.name,
            variant: variant.name,
            stageType: fixture.name === 'BO2' ? 'group_stage' : 'knockout',
            caseElapsedMs: Date.now() - caseStartedAt,
            ...performance,
          };
          rows.push(row);
          process.stdout.write(`P0_P2_CASE_RESULT ${JSON.stringify(row)}\n`);
          if (runtimeId === 'cpp') {
            const cache = performance.cache as { hits: number; misses: number; ratio: number } | null;
            expect(cache).not.toBeNull();
            expect(cache!.misses).toBeGreaterThan(0);
            if (variant.artifactCache) expect(cache!.hits).toBeGreaterThan(0);
            else expect(cache!.hits).toBe(0);
          }
          expect(context.limiter.active).toBe(0);
          expect(context.limiter.pending).toBe(0);
          expect(context.stats.turnMetrics.length).toBeGreaterThan(0);
          }
        }
      }
    }
    const aggregate = selectedFixtures.flatMap(fixture => variants.map(variant => {
      const matching = rows.filter(row => row.fixture === fixture.name && row.variant === variant.name);
      const pairingP50 = matching.map(row => (row.pairingDurationMs as { p50: number }).p50);
      const cache = matching.flatMap(row => {
        const value = row.cache as { hits: number; misses: number; ratio: number } | null;
        return value ? [value] : [];
      });
      const median = (values: number[]) => percentile(values, 0.5);
      const mean = pairingP50.reduce((sum, value) => sum + value, 0) / Math.max(pairingP50.length, 1);
      const stddev = Math.sqrt(pairingP50.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(pairingP50.length, 1));
      return {
        fixture: fixture.name,
        variant: variant.name,
        samples: matching.length,
        pairingDurationMs: { median: median(pairingP50), min: Math.min(...pairingP50), max: Math.max(...pairingP50), stddev },
        cache: {
          hits: cache.reduce((sum, item) => sum + item.hits, 0),
          misses: cache.reduce((sum, item) => sum + item.misses, 0),
        },
        compilationMs: matching.map(row => (row.compilationMs as { p50: number }).p50),
        cleanupFailures: matching.reduce((sum, row) => sum + (row.cleanup as { failures: number }).failures, 0),
      };
    }));
    process.stdout.write(`P0_P2_AGGREGATE ${JSON.stringify(aggregate)}\n`);
    process.stdout.write(`P0_P2_END_TO_END_COMPARISON ${JSON.stringify(rows)}\n`);
    expect(rows).toHaveLength(maxCases);
    expect(rows.every(row => row.runSuccess === true)).toBe(true);
  }, 1_800_000);
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
