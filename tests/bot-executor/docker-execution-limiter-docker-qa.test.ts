/**
 * Opt-in host QA for the process-wide Docker execution limiter.
 *
 * This suite is skipped unless OTT_RUN_DOCKER_LIMITER_QA=true. It requires
 * the same digest-pinned Docker configuration used by the production/benchmark
 * host and must never be used as a sandbox substitute.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  DockerExecutionLimiter,
  DockerExecutor,
  ExecutionCancelledError,
  configuredRuntimeImageRegistry,
  createRevisionDockerExecutor,
  getStrategySdkIdentity,
} from '@bot-executor/index.js';
import type { BotRequestMessage, ExecutionContext } from '@bot-executor/types.js';
import type { SourceRevisionExecution } from '@match-runner/types.js';

const runQa = process.env.OTT_RUN_DOCKER_LIMITER_QA === 'true';
const suite = runQa ? describe : describe.skip;
const QA_RUNTIME_TIMEOUT_MS = 5_000;
const requiredEnv = [
  'BOT_DOCKER_IMAGE',
  'BOT_TRUSTED_IMAGE_REGISTRIES',
  'BOT_CPP_COMPILER_IMAGE',
  'BOT_CPP_RUNTIME_IMAGE',
  'BOT_PYTHON3_RUNTIME_IMAGE',
] as const;

interface QaCleanupExecutor {
  close?(): void;
}

async function cleanupQaResources(executor: QaCleanupExecutor | undefined, root: string | undefined): Promise<void> {
  try {
    executor?.close?.();
  } finally {
    if (root) await fs.rm(root, { recursive: true, force: true });
  }
}

const CPP_SOURCE = Buffer.from('Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) { return legalMoves.front(); }');
const request: BotRequestMessage = {
  protocol_version: '0.1.0', match_id: 'limiter-qa-match', turn: 1, player: 'A',
  board_size: 9, pieces: [{ id: 'A-dam-1', type: 'dam', player: 'A', pos: 'c1' }],
  legal_moves: [{ piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null }],
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Docker limiter QA state');
    await delay(5);
  }
}

function genericContext(executionId: string): ExecutionContext {
  return { executionId, matchId: 'limiter-qa-match', turn: 1, player: 'A', timeoutMs: 5_000 };
}

function genericConfig(command: string): Parameters<DockerExecutor['execute']>[1] {
  return {
    botId: 'limiter-qa-generic', command: 'node', args: ['-e', command],
    timeoutMs: 5_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024,
  };
}

function revisionExecution(id: string, sdk: { version: string; digest: string }): SourceRevisionExecution {
  return {
    kind: 'source-revision', competitorId: `limiter-qa-${id}`, botId: `limiter-qa-${id}`,
    revisionId: `revision-${id}`, runtimeId: 'cpp', sourceDigest: createHash('sha256').update(CPP_SOURCE).digest('hex'),
    executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest,
  };
}

suite('DockerExecutionLimiter host QA', () => {
  let root: string;
  let limiter: DockerExecutionLimiter;
  let generic: DockerExecutor;
  let revision!: ReturnType<typeof createRevisionDockerExecutor>;
  let strategySdk!: { version: string; digest: string };

  beforeEach(async () => {
    const missing = requiredEnv.filter(name => !process.env[name]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `Missing Docker QA configuration: ${missing.join(', ')}. ` +
        'Load the approved digest-pinned values from scripts/run-public.ps1 or run-local.cmd before enabling OTT_RUN_DOCKER_LIMITER_QA.',
      );
    }
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-docker-limiter-qa-'));
    strategySdk = await getStrategySdkIdentity('cpp');
    limiter = new DockerExecutionLimiter(1);
    generic = new DockerExecutor({
      image: process.env.BOT_DOCKER_IMAGE!, executionPolicy: 'sandbox-required',
      workingDirBase: root, dockerExecutionLimiter: limiter,
    });
    revision = createRevisionDockerExecutor({
      imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
      executionPolicy: 'sandbox-required', workingDirBase: path.join(root, 'revision'),
      resourceEnvironment: 'qa', storageNamespace: `limiter-qa-${randomUUID().replaceAll('-', '')}`,
      serverInstanceId: `vitest-${process.pid}-${randomUUID().replaceAll('-', '')}`,
      cppCompilationBackend: 'ephemeral-volume', defaultPreparationTimeoutMs: 20_000,
      defaultTimeoutMs: 5_000, defaultCompileTimeoutMs: 60_000, dockerExecutionLimiter: limiter,
    });
    expect(await generic.isAvailable()).toBe(true);
    expect(await revision.isAvailable()).toBe(true);
  });

  afterEach(async () => {
    await cleanupQaResources(revision, root);
    root = undefined;
  });

  it('shares budget=1 across DockerExecutor and RevisionDockerExecutor, preserves FIFO, and separates wait from execution', async () => {
    const events: Array<{ phase: 'admitted' | 'released'; label: string; waitMs: number; executionMs: number; active: number }> = [];
    limiter = new DockerExecutionLimiter(1, {
      onAdmitted: event => events.push({ ...event, phase: 'admitted', executionMs: 0 }),
      onReleased: event => events.push({ ...event, phase: 'released' }),
    });
    generic = new DockerExecutor({ image: process.env.BOT_DOCKER_IMAGE!, executionPolicy: 'sandbox-required', workingDirBase: root, dockerExecutionLimiter: limiter });
    revision = createRevisionDockerExecutor({
      imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env), executionPolicy: 'sandbox-required',
      workingDirBase: path.join(root, 'revision-fifo'), resourceEnvironment: 'qa', storageNamespace: `limiter-fifo-${randomUUID().replaceAll('-', '')}`,
      serverInstanceId: `vitest-${process.pid}-${randomUUID().replaceAll('-', '')}`, cppCompilationBackend: 'ephemeral-volume',
      defaultPreparationTimeoutMs: 20_000, defaultTimeoutMs: 5_000, defaultCompileTimeoutMs: 60_000, dockerExecutionLimiter: limiter,
    });
    expect(await generic.isAvailable()).toBe(true);
    expect(await revision.isAvailable()).toBe(true);

    const held = await limiter.acquire(undefined, 'qa-held');
    const genericRun = generic.execute(
      genericContext('fifo-generic'),
      genericConfig("setTimeout(() => console.log(JSON.stringify({move:{piece_id:'A-dam-1',from:'c1',to:'c2'}})), 150)"),
      request,
    );
    await waitUntil(() => limiter.pending === 1);
    const revisionRun = revision.executeRevision(
      { executionId: 'fifo-revision', matchId: 'limiter-qa-match', turn: 1, player: 'A', timeoutMs: QA_RUNTIME_TIMEOUT_MS },
      { execution: revisionExecution('fifo', strategySdk), source: CPP_SOURCE }, request,
    );
    await waitUntil(() => limiter.pending === 2);
    await delay(75);
    held();

    const [genericResult, revisionResult] = await Promise.all([genericRun, revisionRun]);
    expect(genericResult.success).toBe(true);
    expect(genericResult.timedOut).toBe(false);
    expect(revisionResult.success, JSON.stringify({
      error: revisionResult.error,
      stderr: revisionResult.stderr,
      stdout: revisionResult.stdout,
      exitCode: revisionResult.exitCode,
      timedOut: revisionResult.timedOut,
      durationMs: revisionResult.durationMs,
      timings: revisionResult.timings,
      limiterEvents: events,
    })).toBe(true);
    expect(revisionResult.timedOut).toBe(false);

    const admitted = events.filter(event => event.phase === 'admitted');
    const completed = events.filter(event => event.phase === 'released');

    // The held permit establishes FIFO across the two executor families. The
    // revision executor may legitimately admit multiple dependent Docker
    // operations (staging, validation, compile and runtime).
    expect(admitted[0]?.label).toBe('qa-held');
    expect(admitted[1]?.label).toBe('generic:fifo-generic');
    const revisionAdmissions = admitted.slice(2).map(event => event.label);
    expect(revisionAdmissions.length).toBeGreaterThanOrEqual(9);
    expect(revisionAdmissions.every(label => label.startsWith('revision:'))).toBe(true);

    const revisionIndex = (fragment: string): number => revisionAdmissions.findIndex(label => label.includes(fragment));
    const runtimeIndex = revisionAdmissions.findIndex(label => label === 'revision:fifo-revision');
    const dependencyOrder = [
      'source', 'sdk', 'permissions', 'verify', 'fifo-revision-compile',
      '-stat',
    ].map(revisionIndex);
    expect(dependencyOrder.every(index => index >= 0)).toBe(true);
    for (let index = 1; index < dependencyOrder.length; index++) {
      expect(dependencyOrder[index]).toBeGreaterThan(dependencyOrder[index - 1]!);
    }
    expect(runtimeIndex).toBeGreaterThan(dependencyOrder.at(-1)!);
    const artifactValidationIndices = ['-stat', '-elf', '-hash'].map(revisionIndex);
    expect(artifactValidationIndices.every(index => index >= 0)).toBe(true);
    for (let index = 1; index < artifactValidationIndices.length; index++) {
      expect(artifactValidationIndices[index]).toBeGreaterThan(artifactValidationIndices[index - 1]!);
    }
    expect(runtimeIndex).toBeGreaterThan(artifactValidationIndices.at(-1)!);

    const admittedCounts = new Map<string, number>();
    const releasedCounts = new Map<string, number>();
    for (const event of admitted) admittedCounts.set(event.label, (admittedCounts.get(event.label) ?? 0) + 1);
    for (const event of completed) releasedCounts.set(event.label, (releasedCounts.get(event.label) ?? 0) + 1);
    expect(completed.length).toBe(admitted.length);
    expect([...admittedCounts.entries()].sort()).toEqual([...releasedCounts.entries()].sort());
    expect(Math.max(...admitted.map(event => event.active))).toBeLessThanOrEqual(1);
    expect(Math.max(...completed.map(event => event.active))).toBeLessThanOrEqual(1);
    expect(completed.every(event => event.waitMs >= 0 && event.executionMs > 0)).toBe(true);
    expect(completed.find(event => event.label === 'generic:fifo-generic')?.waitMs).toBeGreaterThan(0);
    expect(completed.find(event => event.label.startsWith('revision:'))?.waitMs).toBeGreaterThan(0);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  }, 60_000);

  it('cancels a queued executor without spawning Docker and releases a failed execution before cleanup isolation', async () => {
    const admitted: string[] = [];
    limiter = new DockerExecutionLimiter(1, { onAdmitted: event => admitted.push(event.label) });
    generic = new DockerExecutor({ image: process.env.BOT_DOCKER_IMAGE!, executionPolicy: 'sandbox-required', workingDirBase: root, dockerExecutionLimiter: limiter });
    expect(await generic.isAvailable()).toBe(true);

    const held = await limiter.acquire(undefined, 'qa-held');
    const controller = new AbortController();
    const cancelledWithSignal = generic.execute({ ...genericContext('queued-cancel-signal'), signal: controller.signal }, genericConfig('console.log("should-not-run")'), request);
    await waitUntil(() => limiter.pending === 1);
    controller.abort('queued QA cancellation');
    await expect(cancelledWithSignal).rejects.toBeInstanceOf(ExecutionCancelledError);
    held();
    expect(admitted).not.toContain('generic:queued-cancel-signal');

    const failed = await generic.execute(genericContext('cleanup-failure'), genericConfig('process.exit(17)'), request);
    expect(failed.success).toBe(false);
    expect(limiter.active).toBe(0);
    const recovered = await generic.execute(genericContext('cleanup-retry'), genericConfig("console.log(JSON.stringify({move:{piece_id:'A-dam-1',from:'c1',to:'c2'}}))"), request);
    expect(recovered.success).toBe(true);
    expect(recovered.timedOut).toBe(false);
    expect(limiter.active).toBe(0);
  }, 60_000);

  it('bridges the ephemeral-volume cache across isolated matches and skips the second compile', async () => {
    const cacheRoot = path.join(root, 'compiled-cache');
    const bridge = createRevisionDockerExecutor({
      imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
      executionPolicy: 'sandbox-required', workingDirBase: path.join(root, 'bridge'),
      compiledArtifactCacheDir: cacheRoot, resourceEnvironment: 'qa',
      storageNamespace: `bridge-${randomUUID().replaceAll('-', '')}`,
      serverInstanceId: `vitest-bridge-${process.pid}-${randomUUID().replaceAll('-', '')}`,
      cppCompilationBackend: 'ephemeral-volume', cppEphemeralArtifactCache: true,
      defaultPreparationTimeoutMs: 20_000, defaultTimeoutMs: 5_000, defaultCompileTimeoutMs: 60_000,
      dockerExecutionLimiter: limiter,
    });
    try {
      expect(await bridge.isAvailable('cpp')).toBe(true);
      const first = await bridge.executeRevision(
        { executionId: 'bridge-cache-miss', matchId: 'bridge-match-a', turn: 1, player: 'A', timeoutMs: QA_RUNTIME_TIMEOUT_MS },
        { execution: revisionExecution('bridge', strategySdk), source: CPP_SOURCE }, request,
      );
      const second = await bridge.executeRevision(
        { executionId: 'bridge-cache-hit', matchId: 'bridge-match-b', turn: 1, player: 'A', timeoutMs: QA_RUNTIME_TIMEOUT_MS },
        { execution: revisionExecution('bridge', strategySdk), source: CPP_SOURCE }, request,
      );
      expect(first.success, JSON.stringify(first)).toBe(true);
      expect(second.success, JSON.stringify(second)).toBe(true);
      expect(first.timings.compilationContainerMs).toBeGreaterThan(0);
      expect(second.timings.compilationContainerMs).toBeNull();
      expect(second.provenance?.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
      const speedup = second.durationMs > 0 ? (first.durationMs / second.durationMs).toFixed(2) : 'n/a';
      console.log(`[P2 bridge QA] miss=${first.durationMs}ms hit=${second.durationMs}ms speedup=${speedup}x compileMiss=${first.timings.compilationContainerMs}ms compileHit=null`);
      expect(limiter.active).toBe(0);
    } finally { bridge.close(); }
  }, 180_000);

  it('benchmarks repeated ephemeral-volume cache misses, cold-process hits and warm hits', async () => {
    const cacheRoot = path.join(root, 'compiled-cache-benchmark');
    const storageNamespace = `bridge-bench-${randomUUID().replaceAll('-', '')}`;
    const makeExecutor = (suffix: string) => createRevisionDockerExecutor({
      imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
      executionPolicy: 'sandbox-required', workingDirBase: path.join(root, `bench-${suffix}`),
      compiledArtifactCacheDir: cacheRoot, resourceEnvironment: 'qa', storageNamespace,
      serverInstanceId: `vitest-bench-${process.pid}-${suffix}-${randomUUID().replaceAll('-', '')}`,
      cppCompilationBackend: 'ephemeral-volume', cppEphemeralArtifactCache: true,
      defaultPreparationTimeoutMs: 20_000, defaultTimeoutMs: 5_000, defaultCompileTimeoutMs: 60_000,
      dockerExecutionLimiter: limiter,
    });
    const revision = (id: string, source: Buffer) => ({
      execution: { ...revisionExecution(id, strategySdk), sourceDigest: createHash('sha256').update(source).digest('hex') }, source,
    });
    const run = async (executor: ReturnType<typeof createRevisionDockerExecutor>, id: string, source: Buffer) => {
      const result = await executor.executeRevision(
        { executionId: id, matchId: id, turn: 1, player: 'A', timeoutMs: QA_RUNTIME_TIMEOUT_MS },
        revision(id, source), request,
      );
      expect(result.success, JSON.stringify(result)).toBe(true);
      return result;
    };
    const percentile = (values: number[], p: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
    };
    const misses = Array.from({ length: 4 }, (_, index) => Buffer.from(`${CPP_SOURCE.toString('utf8')}\n// isolated-cache-miss-${index}`));
    const missExecutor = makeExecutor('miss');
    const missResults: Awaited<ReturnType<typeof run>>[] = [];
    try {
      expect(await missExecutor.isAvailable('cpp')).toBe(true);
      for (let index = 0; index < misses.length; index++) missResults.push(await run(missExecutor, `bridge-bench-miss-${index}`, misses[index]!));
    } finally { missExecutor.close(); }
    const coldHitExecutor = makeExecutor('cold-hit');
    const coldHitResults: Awaited<ReturnType<typeof run>>[] = [];
    try {
      expect(await coldHitExecutor.isAvailable('cpp')).toBe(true);
      coldHitResults.push(await run(coldHitExecutor, 'bridge-bench-cold-hit', misses[0]!));
    } finally { coldHitExecutor.close(); }
    const warmHitExecutor = makeExecutor('warm-hit');
    const warmHitResults: Awaited<ReturnType<typeof run>>[] = [];
    try {
      expect(await warmHitExecutor.isAvailable('cpp')).toBe(true);
      for (let index = 0; index < misses.length; index++) warmHitResults.push(await run(warmHitExecutor, `bridge-bench-warm-hit-${index}`, misses[index]!));
    } finally { warmHitExecutor.close(); }
    const missLatency = missResults.map(result => result.durationMs);
    const hitLatency = [...coldHitResults, ...warmHitResults].map(result => result.durationMs);
    const allHits = [...coldHitResults, ...warmHitResults];
    expect(missResults.every(result => (result.timings.compilationContainerMs ?? 0) > 0)).toBe(true);
    expect(allHits.every(result => result.timings.compilationContainerMs === null)).toBe(true);
    console.log(`[P2 bridge benchmark] samples miss=${missLatency.length} hit=${hitLatency.length} hitRatio=${(allHits.length / (missResults.length + allHits.length)).toFixed(2)} missP50=${percentile(missLatency, 0.50)}ms missP95=${percentile(missLatency, 0.95)}ms hitP50=${percentile(hitLatency, 0.50)}ms hitP95=${percentile(hitLatency, 0.95)}ms compileSaved=${allHits.length}/${allHits.length} coldHit=${coldHitResults[0]!.durationMs}ms warmHitP50=${percentile(warmHitResults.map(result => result.durationMs), 0.50)}ms`);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  }, 300_000);
});

describe('Docker limiter QA setup cleanup', () => {
  it('does not mask a setup failure that occurs before a temporary root exists', async () => {
    await expect(cleanupQaResources(undefined, undefined)).resolves.toBeUndefined();
  });
});

describe('Docker limiter QA revision fixture contract', () => {
  it('uses the strategy source and ephemeral-volume path used by passing RevisionDockerExecutor QA', () => {
    const execution = revisionExecution('contract', { version: 'qa-sdk', digest: 'a'.repeat(64) });
    expect(execution.runtimeId).toBe('cpp');
    expect(execution.executionMode).toBe('strategy');
    expect(execution.sdkVersion).toBe('qa-sdk');
    expect(execution.sdkDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(CPP_SOURCE.toString('utf8')).toContain('chooseMove');
  });
});

