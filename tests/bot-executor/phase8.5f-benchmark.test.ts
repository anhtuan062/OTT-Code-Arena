import { describe, expect, it } from 'vitest';
import { buildCppRuntimeDockerArgs, buildStrategyCppCompileDockerArgs } from '@bot-executor/revision-docker-executor.js';
import { wrapCppStrategySource } from '@bot-executor/strategy-sdk.js';
import {
  CANDIDATES,
  RESOURCE_VALIDATION_CANDIDATES,
  analyzeConcurrentSamples,
  assertSandboxArgs,
  balancedCandidateSchedule,
  candidateCompileArgs,
  candidatesForMode,
  elfArchitecture,
  statistics,
  summarizeCandidate,
} from '../../scripts/phase8.5f-benchmark.mjs';

const config = {
  imageRegistry: {
    cppCompilerImage: `docker.io/library/gcc@sha256:${'a'.repeat(64)}`,
    cppRuntimeImage: `docker.io/library/debian@sha256:${'b'.repeat(64)}`,
    python3RuntimeImage: `docker.io/library/python@sha256:${'c'.repeat(64)}`,
    trustedRegistries: ['docker.io'],
  },
  executionPolicy: 'sandbox-required' as const,
};

describe('Phase 8.5F benchmark configuration (no Docker)', () => {
  const production = buildStrategyCppCompileDockerArgs(config, 'fixture', 'C:\source', 'C:\sdk', 'C:\output');

  it('uses the exact production compiler command as baseline', () => {
    expect(candidateCompileArgs(production, CANDIDATES[0])).toEqual(production);
    expect(() => assertSandboxArgs(production, 'compiler')).not.toThrow();
    const runtime = buildCppRuntimeDockerArgs(config, 'fixture', 'C:\output');
    expect(() => assertSandboxArgs(runtime, 'runtime')).not.toThrow();
    expect(runtime).toContain('256m');
    expect(runtime).toContain('1');
  });

  it('changes only one intended compiler setting per candidate', () => {
    const one = candidateCompileArgs(production, CANDIDATES[1]);
    const zero = candidateCompileArgs(production, CANDIDATES[2]);
    const dynamic = candidateCompileArgs(production, CANDIDATES[3]);
    const resources = candidateCompileArgs(production, CANDIDATES[4]);
    expect(one).toEqual(production.map(arg => arg === '-O2' ? '-O1' : arg));
    expect(zero).toEqual(production.map(arg => arg === '-O2' ? '-O0' : arg));
    expect(dynamic).toEqual(production.filter(arg => arg !== '-static'));
    const expectedResources = [...production];
    expectedResources[expectedResources.indexOf('--cpus') + 1] = '2';
    expectedResources[expectedResources.indexOf('--memory') + 1] = '512m';
    expect(resources).toEqual(expectedResources);
    for (const args of [one, zero, dynamic, resources]) expect(() => assertSandboxArgs(args, 'compiler')).not.toThrow();
  });

  it('rejects a benchmark command with weakened sandbox flags', () => {
    expect(() => assertSandboxArgs(production.filter(arg => arg !== '--read-only'), 'compiler')).toThrow(/sandbox/);
    const networked = [...production];
    networked[networked.indexOf('--network') + 1] = 'bridge';
    expect(() => assertSandboxArgs(networked, 'compiler')).toThrow(/sandbox/);
  });

  it('uses the exact platform C++ wrapper and verifies ELF architecture before runtime', () => {
    const source = 'Move chooseMove(const GameState&, const std::vector<Move>& moves) { return moves.front(); }';
    expect(wrapCppStrategySource(source)).toBe(`#include "ott_strategy_sdk.hpp"\n${source}\nint main() { return ott::run(chooseMove); }\n`);
    const elf = Buffer.alloc(64);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(elf);
    elf[18] = 62;
    expect(elfArchitecture(elf)).toBe('amd64');
    elf[18] = 183;
    expect(elfArchitecture(elf)).toBe('arm64');
    expect(elfArchitecture(Buffer.from('not a binary'))).toBeNull();
  });

  it('reports nearest-rank p95 and never silently drops timing samples', () => {
    expect(statistics([29_250, 25_690, 30_521, 26_470, 28_000])).toEqual({
      count: 5, minMs: 25_690, medianMs: 28_000, maxMs: 30_521, p95Ms: 30_521,
    });
    expect(statistics([])).toBeNull();
  });

  it('focuses validation on baseline/resources and balances execution order', () => {
    expect(candidatesForMode('resource-validation').map(candidate => candidate.id)).toEqual([
      'baseline', 'compiler-resources',
    ]);
    expect(candidatesForMode('full')).toEqual(CANDIDATES);
    expect(() => candidatesForMode('unknown')).toThrow(/Unsupported benchmark mode/);

    const schedule = balancedCandidateSchedule(RESOURCE_VALIDATION_CANDIDATES, 4);
    expect(schedule.map(item => `${item.run}:${item.candidate.id}`)).toEqual([
      '1:baseline', '1:compiler-resources',
      '2:compiler-resources', '2:baseline',
      '3:baseline', '3:compiler-resources',
      '4:compiler-resources', '4:baseline',
    ]);
  });

  it('keeps timeout-censored observations separate from successful compile statistics', () => {
    const samples = [
      { candidate: 'baseline', run: 1, warmup: false, status: 'passed', compileElapsedMs: 25_000, totalWallMs: 25_500, runtimeElapsedMs: 200, compileExitCode: 0, compileTimedOut: false, cleanupVerified: true },
      { candidate: 'baseline', run: 2, warmup: false, status: 'compile-timeout', compileElapsedMs: 30_050, totalWallMs: 30_200, compileExitCode: null, compileTimedOut: true, cleanupVerified: false },
      { candidate: 'baseline', run: 3, warmup: false, status: 'passed', compileElapsedMs: 27_000, totalWallMs: 27_500, runtimeElapsedMs: 210, compileExitCode: 0, compileTimedOut: false, cleanupVerified: true },
      { candidate: 'baseline', run: 0, warmup: true, status: 'compile-timeout', compileElapsedMs: 30_100, compileExitCode: null, compileTimedOut: true },
    ];
    const summary = summarizeCandidate(samples, CANDIDATES[0]);
    expect(summary.measuredRuns).toBe(3);
    expect(summary.compileTimeouts).toBe(1);
    expect(summary.cleanupFailures).toBe(1);
    expect(summary.observedCompileWall).toMatchObject({ count: 3, medianMs: 27_000, maxMs: 30_050 });
    expect(summary.successfulCompileWall).toEqual({ count: 2, minMs: 25_000, medianMs: 26_000, maxMs: 27_000, p95Ms: 27_000 });
    expect(summary.compileWall).toEqual(summary.successfulCompileWall);
  });

  it('validates bounded concurrent workspace/container isolation and independent cleanup', () => {
    const passing = {
      status: 'passed', workspaceId: 'workspace-a', compileContainerName: 'container-a',
      sourceDigest: 'source-a', artifactSha256: 'artifact-a', cleanupVerified: true,
    };
    const second = {
      status: 'passed', workspaceId: 'workspace-b', compileContainerName: 'container-b',
      sourceDigest: 'source-b', artifactSha256: 'artifact-b', cleanupVerified: true,
    };
    expect(analyzeConcurrentSamples([passing, second], 31_000)).toMatchObject({
      requestedConcurrency: 2,
      status: 'passed',
      isolatedWorkspaces: true,
      uniqueContainerNames: true,
      distinctSourceIdentities: true,
      distinctSuccessfulArtifacts: true,
      cleanupVerified: true,
    });

    const oneFailed = analyzeConcurrentSamples([
      passing,
      { ...second, status: 'compile-timeout', artifactSha256: null },
    ], 30_100);
    expect(oneFailed).toMatchObject({
      status: 'complete-with-failures', passedRequests: 1, failedRequests: 1,
      isolatedWorkspaces: true, cleanupVerified: true, distinctSuccessfulArtifacts: null,
    });
    expect(oneFailed.requests[0].artifactSha256).toBe('artifact-a');
  });

  it('does not accept duplicate concurrent workspaces or uncertain cleanup', () => {
    const result = analyzeConcurrentSamples([
      { status: 'passed', workspaceId: 'same', compileContainerName: 'a', sourceDigest: 'one', artifactSha256: 'a', cleanupVerified: true },
      { status: 'passed', workspaceId: 'same', compileContainerName: 'b', sourceDigest: 'two', artifactSha256: 'b', cleanupVerified: false },
    ], 1_000);
    expect(result.status).toBe('complete-with-failures');
    expect(result.isolatedWorkspaces).toBe(false);
    expect(result.cleanupVerified).toBe(false);
  });
});
