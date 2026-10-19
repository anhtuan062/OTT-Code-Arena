/**
 * Host-only Docker QA for the opt-in BO1 scheduler path.
 *
 * This suite is intentionally skipped unless OTT_RUN_BO1_DOCKER_QA=true.
 * It must be run on a prepared Linux Docker host with the configured,
 * digest-pinned runtime images available. Normal CI/sandbox runs do not
 * invoke RevisionDockerExecutor.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { MatchConfig, BotDefinition } from '@match-runner/types.js';
import type { Tournament, TournamentParticipant } from '@tournament/types.js';
import { createMultiStageTournament, getAllTournamentPairings } from '@tournament/multi-stage.js';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { TournamentManager } from '@tournament/manager.js';
import { createMatchRunnerExecutor } from '@tournament/executor.js';
import type { MatchSchedulerCheckpoint } from '@tournament/match-scheduler.js';
import {
  configuredRuntimeImageRegistry,
  createRevisionDockerExecutor,
  getStrategySdkIdentity,
} from '@bot-executor/index.js';
import type { SourceRevisionExecution } from '@match-runner/types.js';

const runDockerQa = process.env.OTT_RUN_BO1_DOCKER_QA === 'true';
const CPP_SOURCE = Buffer.from('Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }');
const QA_RUNTIME_ENVIRONMENT = [
  'BOT_TRUSTED_IMAGE_REGISTRIES',
  'BOT_CPP_COMPILER_IMAGE',
  'BOT_CPP_RUNTIME_IMAGE',
  'BOT_PYTHON3_RUNTIME_IMAGE',
] as const;

function configuredQaRuntimeImageRegistry() {
  const missing = QA_RUNTIME_ENVIRONMENT.filter(name => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing Docker runtime configuration: ${missing.join(', ')}. ` +
      'Load the same environment used by scripts/run-public.ps1 before enabling OTT_RUN_BO1_DOCKER_QA.'
    );
  }
  // Keep the production/benchmark trust boundary and digest validation in
  // configuredRuntimeImageRegistry; this helper only provides a QA preflight.
  return configuredRuntimeImageRegistry('sandbox-required', process.env);
}

function createParticipants(sourceDigest: string, sdk: { version: string; digest: string }): TournamentParticipant[] {
  return Array.from({ length: 8 }, (_, index) => {
    const botId = `qa-scheduler-bot-${index + 1}`;
    const execution: SourceRevisionExecution = {
      kind: 'source-revision', competitorId: `qa-scheduler-competitor-${index + 1}`,
      botId, revisionId: `qa-scheduler-revision-${index + 1}`, runtimeId: 'cpp', sourceDigest,
      executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest,
    };
    const bot: BotDefinition = { botId, player: 'A', command: 'source-revision', args: [], execution };
    return {
      participantId: `qa-scheduler-participant-${index + 1}`,
      name: botId, bot, registeredAt: new Date(1000 + index).toISOString(),
    };
  });
}

function bo1Config(): Tournament['matchConfig'] {
  return {
    protocolVersion: '0.1.0', maxTurns: 20, turnTimeoutMs: 60_000,
    maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024,
    failurePolicy: 'forfeit', maxRetries: 0, logRequests: false,
    logResponses: false, logStates: false, bestOf: 1,
  };
}

async function createQaContext(participantCount: number): Promise<{
  root: string;
  repository: FileTournamentRepository;
  manager: TournamentManager;
  executor: ReturnType<typeof createRevisionDockerExecutor>;
  tournament: Tournament;
  observedClaims: string[];
  releasedScopes: string[];
  checkpoints: MatchSchedulerCheckpoint[];
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-bo1-scheduler-docker-qa-'));
  const repository = new FileTournamentRepository({ baseDir: path.join(root, 'storage') });
  await repository.initialize();
  const sdk = await getStrategySdkIdentity('cpp');
  const sourceDigest = createHash('sha256').update(CPP_SOURCE).digest('hex');
  const tournamentId = `qa-bo1-scheduler-${randomUUID().replaceAll('-', '')}`;
  const participants = createParticipants(sourceDigest, sdk).slice(0, participantCount);
  const tournament = createMultiStageTournament({
    tournamentId, name: 'QA BO1 Scheduler', participants,
    matchConfig: bo1Config(), options: {},
  });
  tournament.status = 'running';
  tournament.startedAt = new Date().toISOString();
  await repository.save(tournament);

  const namespace = `qa-bo1-scheduler-${randomUUID().replaceAll('-', '')}`;
  const executor = createRevisionDockerExecutor({
    imageRegistry: configuredQaRuntimeImageRegistry(),
    executionPolicy: 'sandbox-required', resourceEnvironment: 'qa', storageNamespace: namespace,
    serverInstanceId: `vitest-${process.pid}`, ownerLeaseTtlMs: 5_000,
    workingDirBase: path.join(root, 'work'), cppCompilationBackend: 'ephemeral-volume',
    defaultCompileTimeoutMs: 60_000, defaultPreparationTimeoutMs: 20_000, defaultTimeoutMs: 60_000,
  });
  const releasedScopes: string[] = [];
  const trackedExecutor = new Proxy(executor, {
    get(target, property, receiver) {
      if (property === 'releaseRevisionScope') {
        return async (scopeId: string) => {
          releasedScopes.push(scopeId);
          return target.releaseRevisionScope(scopeId);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const sources = new Map(participants.map(participant => {
    const execution = participant.bot.execution as SourceRevisionExecution;
    return [`${execution.botId}:${execution.revisionId}`, CPP_SOURCE] as const;
  }));
  const resolveRevision = async (execution: SourceRevisionExecution) => sources.get(`${execution.botId}:${execution.revisionId}`) ?? null;
  const rawExecutor = await createMatchRunnerExecutor(bo1Config() as Partial<MatchConfig>, undefined, trackedExecutor, resolveRevision);
  const observedClaims: string[] = [];
  const checkpoints: MatchSchedulerCheckpoint[] = [];
  const managerExecutor = {
    isAvailable: () => rawExecutor.isAvailable(),
    async executeMatch(matchId: string, playerA: BotDefinition, playerB: BotDefinition, config: MatchConfig, callbacks: Parameters<typeof rawExecutor.executeMatch>[4], signal?: AbortSignal) {
      const fresh = await repository.load(tournamentId);
      const pairing = fresh && getAllTournamentPairings(fresh).find(candidate => candidate.matchId === matchId);
      if (pairing?.status !== 'in_progress') throw new Error(`QA durable claim missing for ${matchId}`);
      observedClaims.push(matchId);
      return rawExecutor.executeMatch(matchId, playerA, playerB, config, callbacks, signal);
    },
  };
  const manager = new TournamentManager({
    repository,
    executor: managerExecutor,
    enableMultiStage: true,
    enableBo1MatchScheduler: true,
    onBo1SchedulerCheckpoint: checkpoint => {
      checkpoints.push(checkpoint);
      if (process.env.OTT_RUN_BO1_DOCKER_QA === 'true') {
        process.stdout.write(`BO1_SCHEDULER_CHECKPOINT ${JSON.stringify(checkpoint)}\n`);
      }
    },
  });
  return { root, repository, manager, executor, tournament, observedClaims, releasedScopes, checkpoints };
}

const suite = runDockerQa ? describe : describe.skip;

suite('BO1 scheduler RevisionDockerExecutor QA', () => {
  const contexts: Array<{ root: string; repository: FileTournamentRepository; manager: TournamentManager }> = [];

  afterEach(async () => {
    for (const context of contexts.splice(0)) {
      context.manager.close();
      context.repository.close();
      await fs.rm(context.root, { recursive: true, force: true });
    }
  });

  it('runs BO1 matches at concurrency 1, persists claims/replays, and advances stages', async () => {
    // Four bots retain group-to-knockout stage advancement while keeping the
    // serial Docker workload bounded (7 BO1 matches at scheduler concurrency 1).
    const context = await createQaContext(4);
    contexts.push(context);
    expect(await context.executor.isAvailable()).toBe(true);

    const run = await context.manager.runAllMatches(context.tournament.tournamentId);
    expect(run.success).toBe(true);
    expect(run.data).toBeDefined();
    expect(new Set(context.observedClaims).size).toBe(context.observedClaims.length);
    expect(context.releasedScopes.length).toBeGreaterThan(0);
    expect(context.checkpoints.some(checkpoint => checkpoint.phase === 'settled')).toBe(true);
    const final = await context.repository.load(context.tournament.tournamentId);
    expect(final?.status).toBe('completed');
    expect(final?.stages?.every(stage => stage.status === 'completed')).toBe(true);
    for (const pairing of getAllTournamentPairings(final!)) {
      if (pairing.participantB === null) continue;
      expect(pairing.status).toBe('completed');
      expect(await context.repository.loadMatchResult(context.tournament.tournamentId, pairing.matchId!)).not.toBeNull();
      expect(await context.repository.loadReplay(context.tournament.tournamentId, pairing.matchId!)).not.toBeNull();
    }
  });

  it('cancels and drains an active BO1 worker, then recovers the durable claim', async () => {
    const context = await createQaContext(2);
    contexts.push(context);
    expect(await context.executor.isAvailable()).toBe(true);
    const controller = new AbortController();
    const runPromise = context.manager.runAllMatches(context.tournament.tournamentId, controller.signal);
    setTimeout(() => controller.abort('QA cancellation'), 25);
    const run = await runPromise;
    expect(run.success).toBe(false);
    expect(run.error).toContain('cancelled');
    expect(context.releasedScopes.length).toBeGreaterThan(0);
    const interrupted = await context.repository.load(context.tournament.tournamentId);
    expect(getAllTournamentPairings(interrupted!).some(pairing => pairing.status === 'in_progress')).toBe(true);
    expect(await context.manager.recoverInterruptedTournaments()).toBe(1);
    const recovered = await context.repository.load(context.tournament.tournamentId);
    expect(getAllTournamentPairings(recovered!).some(pairing => pairing.status === 'in_progress')).toBe(false);
  }, 180_000);
});
