import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  DockerExecutionLimiter,
  configuredRuntimeImageRegistry,
  createRevisionDockerExecutor,
  getStrategySdkIdentity,
} from '@bot-executor/index.js';
import type { BotRequestMessage, ExecutionContext } from '@bot-executor/types.js';
import type { SourceRevisionExecution, SourceRuntimeId } from '@match-runner/types.js';

const runQa = process.env.OTT_RUN_WARM_ISOLATION_DOCKER_QA === 'true';
const suite = runQa ? describe : describe.skip;

const requiredEnv = [
  'BOT_TRUSTED_IMAGE_REGISTRIES',
  'BOT_CPP_COMPILER_IMAGE',
  'BOT_CPP_RUNTIME_IMAGE',
  'BOT_PYTHON3_RUNTIME_IMAGE',
] as const;

function request(matchId: string, turn: number): BotRequestMessage {
  return {
    protocol_version: '0.1.0', match_id: matchId, turn, player: 'A', board_size: 9,
    pieces: [{ id: 'A-dam-1', type: 'dam', player: 'A', pos: 'c1' }],
    legal_moves: [
      { piece_id: 'A-dam-1', from: 'c1', to: 'c2', captures: null },
      { piece_id: 'A-dam-1', from: 'c1', to: 'c3', captures: null },
    ],
  };
}

function sourceFor(runtimeId: SourceRuntimeId, marker: string): Buffer {
  if (runtimeId === 'cpp') {
    return Buffer.from(`#include <fstream>
Move chooseMove(const GameState&, const std::vector<Move>& legalMoves) {
  std::ifstream probe("${marker}");
  const bool existed = probe.good();
  std::ofstream write("${marker}");
  write << "turn";
  return legalMoves.at(existed ? 1 : 0);
}
`);
  }
  return Buffer.from(`import os
def choose_move(state, legal_moves):
    existed = os.path.exists(${JSON.stringify(marker)})
    with open(${JSON.stringify(marker)}, 'w', encoding='utf-8') as handle:
        handle.write('turn')
    return legal_moves[1 if existed else 0]
`);
}

function executionFor(runtimeId: SourceRuntimeId, source: Buffer, sdk: { version: string; digest: string }, suffix = ''): SourceRevisionExecution {
  return {
    kind: 'source-revision', competitorId: `isolation-${runtimeId}${suffix}`, botId: `isolation-${runtimeId}${suffix}`,
    revisionId: `revision-${runtimeId}${suffix}`, runtimeId,
    sourceDigest: createHash('sha256').update(source).digest('hex'),
    executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest,
  };
}

function context(executionId: string, scopeId: string, matchId: string, turn: number): ExecutionContext {
  return { executionId, revisionScopeId: scopeId, matchId, turn, player: 'A', timeoutMs: 5_000 };
}

function percentile(samples: number[], percentileRank: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileRank) - 1)];
}

suite('warm-container fresh-turn filesystem isolation', () => {
  let root: string | undefined;
  let executor: ReturnType<typeof createRevisionDockerExecutor> | undefined;
  const scopes = new Set<string>();

  afterEach(async () => {
    for (const scope of scopes) await executor?.releaseRevisionScope(scope).catch(() => {});
    scopes.clear();
    executor?.close();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = undefined;
    executor = undefined;
  });

  it('does not carry /tmp state between turns or revision scopes for C++17 and Python', async () => {
    const missing = requiredEnv.filter(name => !process.env[name]?.trim());
    if (missing.length > 0) throw new Error(`Missing Docker QA configuration: ${missing.join(', ')}`);
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'qa';
    try {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-warm-isolation-'));
      const limiter = new DockerExecutionLimiter(1);
      executor = createRevisionDockerExecutor({
        imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
        executionPolicy: 'sandbox-required', workingDirBase: root,
        resourceEnvironment: 'qa', storageNamespace: `warm-isolation-${randomUUID().replaceAll('-', '')}`,
        serverInstanceId: `warm-isolation-${process.pid}-${randomUUID().replaceAll('-', '')}`,
        cppCompilationBackend: 'ephemeral-volume', defaultPreparationTimeoutMs: 20_000,
        defaultCompileTimeoutMs: 60_000, defaultTimeoutMs: 5_000, dockerExecutionLimiter: limiter,
      });
      expect(await executor.isAvailable('cpp')).toBe(true);

      for (const runtimeId of ['cpp', 'python3'] as const) {
        const sdk = await getStrategySdkIdentity(runtimeId);
        const marker = `/tmp/ott-turn-isolation-${runtimeId}-${randomUUID().replaceAll('-', '')}`;
        const source = sourceFor(runtimeId, marker);
        const execution = executionFor(runtimeId, source, sdk);
        scopes.add(`scope-${runtimeId}`);
        scopes.add(`scope-${runtimeId}-other`);
        const first = await executor.executeRevision(
          context(`${runtimeId}-turn-1`, `scope-${runtimeId}`, `${runtimeId}-match-1`, 1),
          { execution, source }, request(`${runtimeId}-match-1`, 1),
        );
        const second = await executor.executeRevision(
          context(`${runtimeId}-turn-2`, `scope-${runtimeId}`, `${runtimeId}-match-1`, 2),
          { execution, source }, request(`${runtimeId}-match-1`, 2),
        );
        const otherExecution = executionFor(runtimeId, source, sdk, '-other-player-revision');
        const otherScope = await executor.executeRevision(
          context(`${runtimeId}-other-match`, `scope-${runtimeId}-other`, `${runtimeId}-match-2`, 1),
          { execution: otherExecution, source }, request(`${runtimeId}-match-2`, 1),
        );
        expect(first.success, JSON.stringify(first)).toBe(true);
        expect(second.success, JSON.stringify(second)).toBe(true);
        expect(otherScope.success, JSON.stringify(otherScope)).toBe(true);
        expect(first.response?.move.to).toBe('c2');
        expect(second.response?.move.to).toBe('c2');
        expect(otherScope.response?.move.to).toBe('c2');
        console.log(`[warm isolation benchmark] runtime=${runtimeId} first=${first.durationMs}ms second=${second.durationMs}ms otherIdentity=${otherScope.durationMs}ms`);
      }
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }, 180_000);

  it('keeps fresh-turn isolation under concurrency 1 and 2', async () => {
    const missing = requiredEnv.filter(name => !process.env[name]?.trim());
    if (missing.length > 0) throw new Error(`Missing Docker QA configuration: ${missing.join(', ')}`);
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'qa';
    try {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-warm-isolation-concurrency-'));
      for (const concurrency of [1, 2] as const) {
        const limiter = new DockerExecutionLimiter(concurrency);
        const benchmarkExecutor = createRevisionDockerExecutor({
          imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
          executionPolicy: 'sandbox-required', workingDirBase: root,
          resourceEnvironment: 'qa', storageNamespace: `warm-isolation-concurrency-${concurrency}-${randomUUID().replaceAll('-', '')}`,
          serverInstanceId: `warm-isolation-concurrency-${concurrency}-${process.pid}-${randomUUID().replaceAll('-', '')}`,
          cppCompilationBackend: 'ephemeral-volume', defaultPreparationTimeoutMs: 20_000,
          defaultCompileTimeoutMs: 60_000, defaultTimeoutMs: 5_000, dockerExecutionLimiter: limiter,
        });
        const benchmarkScopes = new Set<string>();
        try {
          for (const runtimeId of ['cpp', 'python3'] as const) {
            const sdk = await getStrategySdkIdentity(runtimeId);
            const marker = `/tmp/ott-turn-concurrency-${runtimeId}-${concurrency}-${randomUUID().replaceAll('-', '')}`;
            const source = sourceFor(runtimeId, marker);
            const execution = executionFor(runtimeId, source, sdk, `-concurrency-${concurrency}`);
            const calls = Array.from({ length: 4 }, (_, index) => {
              const scopeId = `concurrency-${concurrency}-${runtimeId}-${index}`;
              benchmarkScopes.add(scopeId);
              return () => benchmarkExecutor.executeRevision(
                context(`${runtimeId}-concurrency-${concurrency}-${index}`, scopeId, `${runtimeId}-concurrency-match-${index}`, index + 1),
                { execution, source }, request(`${runtimeId}-concurrency-match-${index}`, index + 1),
              );
            });
            const samples: number[] = [];
            const results = [];
            for (let index = 0; index < calls.length; index += concurrency) {
              const started = performance.now();
              const batch = await Promise.all(calls.slice(index, index + concurrency).map(call => call()));
              samples.push(...batch.map(result => result.durationMs ?? Math.round(performance.now() - started)));
              results.push(...batch);
            }
            expect(results.every(result => result.success), JSON.stringify(results)).toBe(true);
            expect(results.every(result => result.response?.move.to === 'c2')).toBe(true);
            console.log(`[warm isolation concurrency] runtime=${runtimeId} concurrency=${concurrency} p50=${percentile(samples, 0.5)}ms p95=${percentile(samples, 0.95)}ms samples=${samples.join(',')}`);
          }
        } finally {
          for (const scope of benchmarkScopes) await benchmarkExecutor.releaseRevisionScope(scope).catch(() => {});
          benchmarkExecutor.close();
        }
      }
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }, 180_000);
});
