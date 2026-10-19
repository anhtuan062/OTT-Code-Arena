import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createRevisionDockerExecutor,
  configuredRuntimeImageRegistry,
  getStrategySdkIdentity,
} from '../dist/bot-executor/index.js';
import { createMatchRunnerExecutor } from '../dist/tournament/executor.js';
import { createTournamentManager } from '../dist/tournament/manager.js';
import { createSourceRevisionQaParticipationRequest } from './docker-ownership-fixture.mjs';
import { readPersistedQaMatch } from './docker-ownership-persistence-reader.mjs';
import {
  parseBotCount, summarizeDurations, parseMemoryBytes, summarizeResourceSamples, validateBenchmarkOutcome,
  classifyDockerSamplingError, summarizeProgress, summarizeMatchMetrics, parseBenchmarkMode, parseSamplingOptions, canCleanupAfterTimeout, validateNoBotFailures,
  verifyProtectedResourceBaseline,
} from './docker-multistage-benchmark-lib.mjs';

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const execFileAsync = promisify(execFile);
const PROTECTED_WARM_CONTAINER = 'ott-warm-79f4b9146b25f7e2fe5ab276';
const CPP_SOURCE = 'Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }';
// The production runner imports SDK types in its own module, not into the
// competitor strategy module. Keep the QA fixture annotation-free so it uses
// the public choose_move(state, legal_moves) contract on every supported Python.
const PYTHON_SOURCE = 'def choose_move(state, legal_moves):\n    return legal_moves[0]\n';

function args() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    values.set(key.slice(2), process.argv[++index]);
  }
  return values;
}

function docker(command, timeoutMs = 15_000) {
  return execFileSync('docker', command, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true }).trim();
}

async function dockerAsync(command, timeoutMs = 15_000) {
  const result = await execFileAsync('docker', command, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return result.stdout.trim();
}

async function withTimeout(promise, timeoutMs, label, onTimeout, settleGraceMs = 10_000) {
  let timer;
  let expired = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      try { onTimeout?.(); } catch { /* cancellation is best effort; the bounded grace still applies */ }
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (error) {
    if (expired) {
      await Promise.race([Promise.resolve(promise).catch(() => undefined), new Promise(resolve => setTimeout(resolve, settleGraceMs))]);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseStats(line) {
  const [id, cpu, memory] = line.split('\t');
  const cpuPercent = Number.parseFloat(cpu?.replace('%', ''));
  const memoryBytes = parseMemoryBytes(memory?.split('/')[0]?.trim());
  return { id, cpuPercent, memoryBytes };
}

function protectedSnapshot() {
  try { return docker(['inspect', PROTECTED_WARM_CONTAINER], 5000); } catch (error) {
    if (/no such object|not found/i.test(String(error))) return null;
    throw error;
  }
}

function exactQaResources(namespace, serverId) {
  const containers = docker(['ps', '-aq', '--filter', `label=ott.owner.environment=qa`, '--filter', `label=ott.owner.storage-namespace=${namespace}`]).split(/\r?\n/).filter(Boolean);
  const ownedContainers = containers.filter(id => {
    try {
      const labels = docker(['inspect', '--format', '{{json .Config.Labels}}', id]);
      const parsed = JSON.parse(labels);
      return parsed['ott.owner.environment'] === 'qa' && parsed['ott.owner.storage-namespace'] === namespace && parsed['ott.owner.server-instance'] === serverId;
    } catch { return false; }
  });
  for (const id of ownedContainers) { try { docker(['rm', '--force', id], 10_000); } catch { /* cleanup is best effort; verification below reports leftovers */ } }
  const volumes = docker(['volume', 'ls', '-q', '--filter', `label=ott.owner.environment=qa`, '--filter', `label=ott.owner.storage-namespace=${namespace}`]).split(/\r?\n/).filter(Boolean);
  const ownedVolumes = volumes.filter(name => {
    try {
      const labels = JSON.parse(docker(['volume', 'inspect', '--format', '{{json .Labels}}', name]));
      return labels['ott.owner.environment'] === 'qa' && labels['ott.owner.storage-namespace'] === namespace && labels['ott.owner.server-instance'] === serverId;
    } catch { return false; }
  });
  for (const name of ownedVolumes) { try { docker(['volume', 'rm', name], 10_000); } catch { /* verified below by the host operator */ } }
  return { containers: ownedContainers.length, volumes: ownedVolumes.length };
}

async function main() {
  const cli = args();
  const botCount = parseBotCount(cli.get('bots'));
  const mode = parseBenchmarkMode(cli.get('mode'), botCount);
  const timeoutMs = Number(cli.get('timeout-ms') ?? DEFAULT_TIMEOUT_MS);
  const matchTimeoutMs = Number(cli.get('match-timeout-ms') ?? 120_000);
  const { samplingMode, samplerConcurrency } = parseSamplingOptions(cli.get('sampling') ?? 'on', cli.get('sampler-concurrency') ?? 1);
  const enableBo1MatchScheduler = process.env.OTT_QA_ENABLE_BO1_SCHEDULER === 'true';
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(matchTimeoutMs) || matchTimeoutMs <= 0) throw new Error('--match-timeout-ms must be positive');
  process.env.NODE_ENV = 'qa';

  const imageRegistry = configuredRuntimeImageRegistry('sandbox-required');
  if (docker(['context', 'show']) !== 'desktop-linux') throw new Error('Docker context must be desktop-linux');
  if (!/^linux\|/i.test(docker(['info', '--format', '{{.OSType}}|{{.ServerVersion}}']))) throw new Error('Docker daemon must be Linux');
  for (const image of [imageRegistry.cppCompilerImage, imageRegistry.cppRuntimeImage, imageRegistry.python3RuntimeImage]) docker(['image', 'inspect', image]);
  const warmBefore = protectedSnapshot();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-multistage-benchmark-'));
  const storageDir = path.join(root, 'storage');
  const workingDirBase = path.join(root, 'work');
  const namespace = `qa-benchmark-${randomUUID()}`;
  const serverId = `benchmark-${randomUUID()}`;
  const tournamentId = `qa-${botCount}-${randomUUID()}`;
  await fs.mkdir(workingDirBase, { recursive: true });
  const executorMetrics = [];
  const seenArtifacts = new Set();
  const resourceSamples = [];
  const samplerDiagnostics = { enabled: samplingMode === 'on', concurrency: samplerConcurrency, skippedOverlaps: 0, containerRaces: 0, collectorErrors: 0, dockerErrors: 0, sampleCount: 0, commands: 0, samplingElapsedMs: 0 };
  const progressChanges = [];
  let activeMatch = null;
  let executedMatches = 0;
  let sampler;
  let monitor;
  let manager;
  let workloadSettled = true;
  let cleanupDeferred = false;
  let timeoutContext = null;
  let samplingInFlight = false;
  let schedulerCheckpointCount = 0;
  let firstSchedulerCheckpoint = null;
  try {
    const baseExecutor = createRevisionDockerExecutor({
      imageRegistry, executionPolicy: 'sandbox-required', resourceEnvironment: 'qa', storageNamespace: namespace,
      serverInstanceId: serverId, ownerLeaseTtlMs: 5000, workingDirBase, cppCompilationBackend: 'ephemeral-volume',
      memoryLimit: '256m', cpuLimit: 0.5, pidsLimit: 64, defaultCompileTimeoutMs: 60_000,
      defaultPreparationTimeoutMs: 20_000, defaultTimeoutMs: 60_000,
    });
    if (!(await withTimeout(baseExecutor.isAvailable(), 30_000, 'Docker executor preflight'))) throw new Error('RevisionDockerExecutor is unavailable');
    const instrumentedExecutor = new Proxy(baseExecutor, { get(target, property, receiver) {
      if (property !== 'executeRevision') return Reflect.get(target, property, receiver);
      return async (...parameters) => {
        const startedAt = Date.now();
        const result = await target.executeRevision(...parameters);
        const executionContext = parameters[0] ?? {};
        const artifactDigest = result.provenance?.artifactDigest ?? null;
        const compilationMs = result.timings?.compilationContainerMs ?? null;
        const scopeKey = `${executionContext.revisionScopeId ?? 'no-scope'}:${artifactDigest ?? 'no-artifact'}`;
        const cacheHit = Boolean(artifactDigest && compilationMs == null && seenArtifacts.has(scopeKey));
        if (artifactDigest) seenArtifacts.add(scopeKey);
        executorMetrics.push({
          matchId: executionContext.matchId ?? null, executionId: executionContext.executionId ?? null,
          revisionScopeId: executionContext.revisionScopeId ?? null, turn: executionContext.turn ?? null,
          elapsedMs: Date.now() - startedAt, compilationMs, runtimeMs: result.timings?.runtimeContainerMs ?? null,
          success: result.success, runtimeId: parameters[1]?.execution?.runtimeId ?? null,
          timings: result.timings ?? null, error: result.error ?? null, exitCode: result.exitCode ?? null, cacheHit,
          stderrTail: result.stderr?.slice(-512) ?? '',
        });
        if (!result.success) console.error('DOCKER_MULTISTAGE_BENCHMARK_EXECUTOR_ERROR', JSON.stringify({
          runtimeId: parameters[1]?.execution?.runtimeId ?? null,
          error: result.error ?? null, exitCode: result.exitCode ?? null, stderrTail: result.stderr?.slice(-512) ?? '',
        }));
        return result;
      };
    }});
    const sourceByRevision = new Map();
    const resolveRevision = async execution => sourceByRevision.get(`${execution.botId}:${execution.revisionId}`) ?? null;
    const rawMatchExecutor = await createMatchRunnerExecutor({ maxTurns: 200, turnTimeoutMs: 60_000, bestOf: 1, failurePolicy: 'forfeit' }, undefined, instrumentedExecutor, resolveRevision);
    const matchExecutor = {
      isAvailable: () => rawMatchExecutor.isAvailable(),
      async executeMatch(matchId, playerA, playerB, config, callbacks, signal) {
        const controller = new AbortController();
        const abortExternal = () => controller.abort();
        signal?.addEventListener('abort', abortExternal, { once: true });
        activeMatch = { matchId, startedAt: Date.now() };
        const matchPromise = rawMatchExecutor.executeMatch(matchId, playerA, playerB, config, callbacks, controller.signal);
        try {
          const result = await withTimeout(matchPromise, matchTimeoutMs, `Match ${matchId}`, () => controller.abort(), 15_000);
          executedMatches += 1;
          console.log('DOCKER_MULTISTAGE_BENCHMARK_MATCH', JSON.stringify({
            matchId, executedMatches, durationMs: result.durationMs, turnCount: result.turnCount,
            winner: result.winner, terminationReason: result.terminationReason,
            execution: summarizeMatchMetrics(executorMetrics, matchId),
          }));
          return result;
        } finally {
          activeMatch = null;
          signal?.removeEventListener('abort', abortExternal);
        }
      },
    };
    manager = await createTournamentManager(storageDir, matchExecutor, 'sandbox-required', undefined, async execution => sourceByRevision.has(`${execution.botId}:${execution.revisionId}`), resolveRevision, instrumentedExecutor, true, enableBo1MatchScheduler, checkpoint => {
      schedulerCheckpointCount += 1;
      firstSchedulerCheckpoint ??= checkpoint;
    });
    const created = await manager.createTournament(tournamentId, `QA Docker ${botCount} Bot`, 'multi_stage');
    if (!created.success) throw new Error(created.error);
    await manager.openRegistration(tournamentId);
    for (let index = 0; index < botCount; index += 1) {
      const runtimeId = index % 2 === 0 ? 'cpp' : 'python3';
      const botId = `qa-bot-${index + 1}`;
      const competitorId = `qa-competitor-${index + 1}`;
      const revisionId = `qa-revision-${index + 1}`;
      const source = Buffer.from(runtimeId === 'cpp' ? CPP_SOURCE : PYTHON_SOURCE);
      const identity = await getStrategySdkIdentity(runtimeId);
      const sourceDigest = createHash('sha256').update(source).digest('hex');
      sourceByRevision.set(`${botId}:${revisionId}`, source);
      const request = await manager.submitParticipationRequest(tournamentId, createSourceRevisionQaParticipationRequest({
        botId, competitorId, execution: { kind: 'source-revision', competitorId, botId, revisionId, runtimeId, sourceDigest, executionMode: 'strategy', sdkVersion: identity.version, sdkDigest: identity.digest },
      }));
      if (!request.success) throw new Error(request.error);
      if (!request.data) throw new Error('Participation request was not created');
      const approved = await manager.reviewParticipationRequest(tournamentId, request.data.requestId, 'qa-organizer', 'approve');
      if (!approved.success) throw new Error(approved.error);
    }
    await manager.closeRegistration(tournamentId);
    const schedule = await manager.generateSchedule(tournamentId);
    if (!schedule.success || !(schedule.data?.stages?.some(stage => stage.stageType === 'group_stage') && schedule.data?.stages?.some(stage => stage.stageType === 'knockout'))) throw new Error(schedule.error ?? 'Multi-stage schedule was not created');
    const started = await manager.startTournament(tournamentId);
    if (!started.success) throw new Error(started.error);
    let lastProgress = '';
    const checkpoint = async (reason) => {
      const loaded = await manager.loadTournament(tournamentId);
      if (!loaded.success || !loaded.data) return;
      const progress = summarizeProgress(loaded.data);
      const serialized = JSON.stringify(progress);
      if (serialized === lastProgress && reason === 'poll') return;
      lastProgress = serialized;
      progressChanges.push({ reason, progress });
      console.log('DOCKER_MULTISTAGE_BENCHMARK_CHECKPOINT', JSON.stringify({ reason, ...progress }));
    };
    const sample = async () => {
      if (samplingInFlight) {
        samplerDiagnostics.skippedOverlaps += 1;
        return;
      }
      samplingInFlight = true;
      const sampleStartedAt = Date.now();
      try {
        const psCommand = ['ps', '-q', '--filter', 'label=ott.owner.environment=qa', '--filter', `label=ott.owner.storage-namespace=${namespace}`];
        samplerDiagnostics.commands += 1;
        const ids = (await dockerAsync(psCommand, 10_000)).split(/\r?\n/).filter(Boolean);
        if (!ids.length) return;
        let nextIndex = 0;
        const worker = async () => {
          while (nextIndex < ids.length) {
            const id = ids[nextIndex++];
            const phase = `stats:${id}`;
            const command = ['stats', '--no-stream', '--format', '{{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}', id];
            samplerDiagnostics.commands += 1;
            try {
              const lines = (await dockerAsync(command, 10_000)).split(/\r?\n/).filter(Boolean);
              for (const line of lines) resourceSamples.push(parseStats(line));
              samplerDiagnostics.sampleCount += 1;
            } catch (error) {
              let classification = classifyDockerSamplingError(error);
              if (classification === 'docker-error' && /EOF/i.test(String(error?.stderr ?? error?.message ?? error))) {
                try {
                  const visibleIds = (await dockerAsync(['ps', '-q', '--filter', 'label=ott.owner.environment=qa', '--filter', `label=ott.owner.storage-namespace=${namespace}`], 10_000)).split(/\r?\n/).filter(Boolean);
                  samplerDiagnostics.commands += 1;
                  classification = classifyDockerSamplingError(error, { containerId: id, visibleIds });
                } catch {
                  classification = 'docker-error';
                }
              }
              samplerDiagnostics[classification === 'container-race' ? 'containerRaces' : classification === 'docker-error' ? 'dockerErrors' : 'collectorErrors'] += 1;
              if (classification !== 'container-race') console.error('DOCKER_MULTISTAGE_BENCHMARK_SAMPLER_ERROR', JSON.stringify({ phase, command, classification, stderr: String(error?.stderr ?? error?.message ?? error) }));
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(samplerConcurrency, ids.length) }, () => worker()));
      } catch (error) {
        const classification = classifyDockerSamplingError(error);
        samplerDiagnostics[classification === 'container-race' ? 'containerRaces' : classification === 'docker-error' ? 'dockerErrors' : 'collectorErrors'] += 1;
        if (classification !== 'container-race') console.error('DOCKER_MULTISTAGE_BENCHMARK_SAMPLER_ERROR', JSON.stringify({ phase: 'ps', command: 'docker ps', classification, stderr: String(error?.stderr ?? error?.message ?? error) }));
      } finally {
        samplerDiagnostics.samplingElapsedMs += Date.now() - sampleStartedAt;
        samplingInFlight = false;
      }
    };
    await checkpoint('started');
    if (samplingMode === 'on') sampler = setInterval(() => { void sample(); }, 2_000);
    monitor = setInterval(() => { void checkpoint('poll'); }, 1_000);
    const startedAt = Date.now();
    const runController = new AbortController();
    workloadSettled = false;
    const runPromise = manager.runAllMatches(tournamentId, runController.signal).finally(() => { workloadSettled = true; });
    let run;
    try {
      run = await withTimeout(runPromise, timeoutMs, `Docker ${botCount}-Bot tournament`, () => {
        timeoutContext = { triggeredAt: new Date().toISOString(), activeMatch, executedMatches, executorCalls: executorMetrics.length };
        runController.abort();
      }, 30_000);
    } catch (error) {
      await checkpoint('timeout');
      console.error('DOCKER_MULTISTAGE_BENCHMARK_TIMEOUT_SNAPSHOT', JSON.stringify({
        activeMatch, timeoutContext, executedMatches, executorCalls: executorMetrics.length, progressChanges: progressChanges.length,
        samplerDiagnostics, workloadSettled, error: error.message,
      }));
      if (!canCleanupAfterTimeout(workloadSettled)) cleanupDeferred = true;
      throw error;
    }
    if (!run.success || !run.data) throw new Error(run.error ?? 'Tournament execution failed');
    const final = await manager.loadTournament(tournamentId);
    if (!final.success || !final.data) throw new Error(final.error ?? 'Final tournament could not be loaded');
    validateNoBotFailures(run.data);
    const outcome = validateBenchmarkOutcome(final.data, botCount);
    const persisted = [];
    for (const result of run.data) persisted.push(await readPersistedQaMatch(storageDir, tournamentId, result.matchResult.matchId));
    const matchIds = run.data.map(result => result.matchResult.matchId);
    if (new Set(matchIds).size !== matchIds.length || persisted.length !== run.data.length) throw new Error('Match result/replay count or identity is inconsistent');
    if (persisted.some(item => !item.commitVerified)) throw new Error('A persisted match commit did not verify');
    if (enableBo1MatchScheduler && schedulerCheckpointCount === 0) {
      throw new Error('BO1 scheduler was requested but emitted no scheduler checkpoints');
    }
    const compile = executorMetrics.filter(item => item.timings?.compilationContainerMs != null).map(item => item.timings.compilationContainerMs);
    const runtime = executorMetrics.filter(item => item.timings?.runtimeContainerMs != null).map(item => item.timings.runtimeContainerMs);
    const matchDurations = run.data.map(item => item.matchResult.durationMs).filter(Number.isFinite);
    const warmAfter = protectedSnapshot();
    const protectedWarmVerification = verifyProtectedResourceBaseline(warmBefore, warmAfter);
    if (protectedWarmVerification.status === 'changed') throw new Error('Protected warm container changed during benchmark');
    if (samplerDiagnostics.dockerErrors || samplerDiagnostics.collectorErrors) {
      throw new Error(`Metrics collector observed ${samplerDiagnostics.dockerErrors} Docker error(s) and ${samplerDiagnostics.collectorErrors} collector error(s)`);
    }
    console.log('DOCKER_MULTISTAGE_BENCHMARK_RESULT', JSON.stringify({
      bots: botCount, tournamentId, elapsedMs: Date.now() - startedAt, matches: outcome.pairingCount,
      mode,
      completedMatches: run.data.length, champion: outcome.champion, compileStats: summarizeDurations(compile),
      runtimeStats: summarizeDurations(runtime), matchStats: summarizeDurations(matchDurations),
      matchBreakdowns: run.data.map(result => ({ matchId: result.matchResult.matchId, turnCount: result.matchResult.turnCount, ...summarizeMatchMetrics(executorMetrics, result.matchResult.matchId) })),
      executorCalls: executorMetrics.length, cacheHits: executorMetrics.filter(item => item.cacheHit).length,
      resourceStats: summarizeResourceSamples(resourceSamples), samplerDiagnostics, progressCheckpoints: progressChanges.length,
      replayCommitChecks: persisted.length,
      schedulerPath: enableBo1MatchScheduler ? 'bo1-match-scheduler' : 'legacy-runAllMatches',
      schedulerFlagEnabled: enableBo1MatchScheduler,
      schedulerCheckpointCount,
      firstSchedulerCheckpoint,
      protectedWarmBaseline: protectedWarmVerification.baseline,
      protectedWarmVerification: protectedWarmVerification.status,
      protectedWarmUnchanged: protectedWarmVerification.verified,
    }));
  } finally {
    if (sampler) clearInterval(sampler);
    if (monitor) clearInterval(monitor);
    if (!cleanupDeferred && canCleanupAfterTimeout(workloadSettled)) {
      manager?.close();
      try { exactQaResources(namespace, serverId); } catch (error) { console.error(`QA cleanup verification failed: ${error.message}`); }
      await fs.rm(root, { recursive: true, force: true });
    } else {
      console.error('DOCKER_MULTISTAGE_BENCHMARK_CLEANUP_DEFERRED', JSON.stringify({ namespace, serverId, workloadSettled }));
    }
  }
}

main().catch(error => { console.error(`DOCKER_MULTISTAGE_BENCHMARK_FAIL ${error.message}`); process.exitCode = 1; });
