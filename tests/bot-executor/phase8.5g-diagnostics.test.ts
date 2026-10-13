import { describe, expect, it } from 'vitest';
import {
  analyzeConcurrentDiagnostics,
  parseCpuStat,
  parseDockerStats,
  parseMemoryEvents,
  parseStateTiming,
  summarizeDiagnosticSamples,
  variantSchedule,
} from '../../scripts/phase8.5g-diagnostics.mjs';

describe('Phase 8.5G diagnostic evidence helpers', () => {
  it('parses Docker state timestamps without inventing missing timing', () => {
    expect(parseStateTiming({ StartedAt: '2026-10-12T10:00:00.100Z', FinishedAt: '2026-10-12T10:00:02.350Z' }, 3000)).toEqual({
      containerProcessMs: 2250,
      combinedNonProcessOverheadMs: 750,
      timingComplete: true,
    });
    expect(parseStateTiming({ StartedAt: '', FinishedAt: '' }, 3000)).toEqual({
      containerProcessMs: null,
      combinedNonProcessOverheadMs: null,
      timingComplete: false,
    });
  });

  it('parses attributable cgroup counters and preserves unavailable observations', () => {
    expect(parseCpuStat('usage_usec 12345\nnr_periods 8\nnr_throttled 3\nthrottled_usec 4567\n')).toEqual({
      usageUsec: 12345, nrPeriods: 8, nrThrottled: 3, throttledUsec: 4567,
    });
    expect(parseMemoryEvents('low 0\nhigh 2\nmax 4\noom 1\noom_kill 0\n')).toEqual({ low: 0, high: 2, max: 4, oom: 1, oomKill: 0 });
    expect(parseCpuStat('unsupported')).toBeNull();
    expect(parseMemoryEvents('')).toBeNull();
  });

  it('parses sampled Docker stats with explicit units', () => {
    expect(parseDockerStats('82.50%|120.5MiB / 256MiB|1.2MB / 64kB')).toEqual({
      cpuPercent: 82.5,
      memoryBytes: 126353408,
      memoryLimitBytes: 268435456,
      blockReadBytes: 1200000,
      blockWriteBytes: 64000,
    });
    expect(parseDockerStats('')).toBeNull();
  });

  it('balances diagnostic variant order and excludes warm-ups from summaries', () => {
    const variants = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(variantSchedule(variants, 2).map(item => `${item.run}:${item.variant.id}`)).toEqual([
      '1:a', '1:b', '1:c', '2:b', '2:c', '2:a',
    ]);
    const summary = summarizeDiagnosticSamples([
      { variant: 'a', warmup: true, status: 'timeout', timedOut: true, hostInvocationMs: 30_000 },
      { variant: 'a', warmup: false, status: 'passed', timedOut: false, hostInvocationMs: 1000, containerProcessMs: 700, cleanupVerified: true },
      { variant: 'a', warmup: false, status: 'timeout', timedOut: true, hostInvocationMs: 30_000, containerProcessMs: 29_500, cleanupVerified: true },
    ], variants[0]);
    expect(summary).toMatchObject({ measuredRuns: 2, completed: 1, timeouts: 1, cleanupFailures: 0 });
    expect(summary.completedHostWall).toMatchObject({ count: 1, medianMs: 1000 });
    expect(summary.observedHostWall).toMatchObject({ count: 2, maxMs: 30_000 });
    expect(summary.observedHostWall.p95Ms).toBeNull();
  });

  it('requires two isolated successful artifacts before concurrency correctness passes', () => {
    expect(analyzeConcurrentDiagnostics([
      { workspaceId: 'a', containerName: 'ca', status: 'passed', artifactSha256: 'aa', cleanupVerified: true },
      { workspaceId: 'b', containerName: 'cb', status: 'passed', artifactSha256: 'bb', cleanupVerified: true },
    ], 5000)).toMatchObject({ status: 'passed', artifactIsolation: 'verified', isolatedWorkspaces: true });
    expect(analyzeConcurrentDiagnostics([
      { workspaceId: 'a', containerName: 'ca', status: 'timeout', artifactSha256: null, cleanupVerified: true },
      { workspaceId: 'b', containerName: 'cb', status: 'timeout', artifactSha256: null, cleanupVerified: true },
    ], 30_000)).toMatchObject({ status: 'complete-with-failures', artifactIsolation: 'unverified' });
  });
});
