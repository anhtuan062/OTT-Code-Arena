import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseBotCount, percentile, summarizeDurations, parseMemoryBytes, summarizeResourceSamples,
  flattenPairings, validateBenchmarkOutcome,
  classifyDockerSamplingError, summarizeProgress,
  parseBenchmarkMode, parseSamplingOptions, canCleanupAfterTimeout,
  validateNoBotFailures,
  summarizeMatchMetrics,
  verifyProtectedResourceBaseline,
} from '../../scripts/docker-multistage-benchmark-lib.mjs';

describe('Docker multi-stage benchmark preparation', () => {
  it('accepts smoke workloads and preserves official workload classification', () => {
    expect(parseBotCount('4')).toBe(4);
    expect(parseBotCount('8')).toBe(8);
    expect(parseBotCount('16')).toBe(16);
    expect(parseBotCount('32')).toBe(32);
    expect(() => parseBotCount('64')).toThrow();
    expect(parseBenchmarkMode(undefined, 4)).toBe('smoke');
    expect(parseBenchmarkMode('smoke', 8)).toBe('smoke');
    expect(parseBenchmarkMode(undefined, 16)).toBe('official');
    expect(() => parseBenchmarkMode('official', 8)).toThrow();
  });

  it('calculates bounded latency and resource summaries', () => {
    expect(percentile([5, 1, 9, 3], 0.5)).toBe(3);
    expect(summarizeDurations([5, 1, 9, 3])).toMatchObject({ count: 4, p50Ms: 3, p95Ms: 9 });
    expect(parseMemoryBytes('12.5MiB')).toBe(13_107_200);
    expect(summarizeResourceSamples([{ cpuPercent: 1.2, memoryBytes: 2 }, { cpuPercent: 4.5, memoryBytes: 8 }])).toMatchObject({ sampleCount: 2, maxCpuPercent: 4.5, maxMemoryBytes: 8 });
  });

  it('breaks a match into compile, runtime, Docker overhead and cache reuse', () => {
    const summary = summarizeMatchMetrics([
      { matchId: 'm1', elapsedMs: 20, compilationMs: 10, runtimeMs: 5, cacheHit: false, runtimeId: 'cpp' },
      { matchId: 'm1', elapsedMs: 8, compilationMs: null, runtimeMs: 6, cacheHit: true, runtimeId: 'cpp' },
      { matchId: 'm2', elapsedMs: 50, compilationMs: 30, runtimeMs: 10, cacheHit: false, runtimeId: 'python3' },
    ], 'm1');
    expect(summary).toMatchObject({ executorCalls: 2, elapsedMs: 28, compilationMs: 10, runtimeMs: 11, dockerCliOverheadMs: 7, cacheHits: 1, cacheMisses: 1 });
  });

  it('distinguishes a --rm container race from a real Docker error', () => {
    expect(classifyDockerSamplingError({ stderr: 'Error response from daemon: No such container: abc' })).toBe('container-race');
    expect(classifyDockerSamplingError({ stderr: 'Cannot connect to the Docker daemon' })).toBe('docker-error');
  });

  it('classifies mixed stats races per container without hiding an active-container EOF', () => {
    expect(classifyDockerSamplingError({ stderr: 'EOF' }, { containerId: 'gone', visibleIds: ['active'] })).toBe('container-race');
    expect(classifyDockerSamplingError({ stderr: 'EOF' }, { containerId: 'active', visibleIds: ['active'] })).toBe('docker-error');
  });

  it('bounds sampler concurrency and supports a QA-only disabled mode', () => {
    expect(parseSamplingOptions('off', 1)).toEqual({ samplingMode: 'off', samplerConcurrency: 1 });
    expect(parseSamplingOptions('on', '2')).toEqual({ samplingMode: 'on', samplerConcurrency: 2 });
    expect(() => parseSamplingOptions('on', 0)).toThrow(/sampler-concurrency/);
    expect(() => parseSamplingOptions('on', 5)).toThrow(/sampler-concurrency/);
    expect(() => parseSamplingOptions('disabled', 1)).toThrow(/sampling/);
  });

  it('does not cleanup while an aborted workload is still unsettled', () => {
    expect(canCleanupAfterTimeout(false)).toBe(false);
    expect(canCleanupAfterTimeout(true)).toBe(true);
  });

  it('does not treat an absent protected-resource baseline as preservation proof', () => {
    expect(verifyProtectedResourceBaseline(null, null)).toEqual({
      baseline: 'absent', status: 'baseline_absent', verified: false,
    });
    expect(verifyProtectedResourceBaseline('before', 'before')).toEqual({
      baseline: 'present', status: 'verified', verified: true,
    });
    expect(verifyProtectedResourceBaseline('before', null).status).toBe('changed');
  });

  it('fails completed benchmark results when any Bot forfeits or crashes', () => {
    expect(() => validateNoBotFailures([{ matchResult: { matchId: 'm1', terminationReason: 'bot_crash' } }])).toThrow(/Bot crash\/forfeit/);
    expect(validateNoBotFailures([{ matchResult: { matchId: 'm2', terminationReason: 'goal_reached' } }])).toBe(true);
  });

  it('imports and executes the Python smoke strategy through the SDK runner', async () => {
    const python = process.env.PYTHON ?? 'python';
    const temp = await mkdtemp(path.join(os.tmpdir(), 'ott-python-smoke-'));
    const strategy = path.join(temp, 'strategy.py');
    const runner = path.resolve('bot-sdk/python/runner.py');
    await writeFile(strategy, 'def choose_move(state, legal_moves):\n    return legal_moves[0]\n');
    const input = JSON.stringify({ protocol_version: '0.1.0', match_id: 'smoke', turn: 1, player: 'A', board_size: 9, pieces: [], legal_moves: [{ piece_id: 'p1', from: 'a1', to: 'a2' }] });
    try {
      const output = execFileSync(python, [runner, strategy], { cwd: path.resolve('bot-sdk/python'), input, encoding: 'utf8', timeout: 10_000 });
      expect(JSON.parse(output).move).toMatchObject({ piece_id: 'p1', from: 'a1', to: 'a2' });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it('summarizes stage progress without requiring the full tournament payload', () => {
    const progress = summarizeProgress({ tournamentId: 't1', status: 'running', stages: [{ stageId: 's1', stageType: 'group_stage', status: 'in_progress', rounds: [{ pairings: [{ status: 'completed' }, { status: 'in_progress' }, { status: 'scheduled' }] }] }] });
    expect(progress.stages[0]).toMatchObject({ total: 3, completed: 1, inProgress: 1, pending: 1, pendingTiebreaker: 0 });
  });

  it('deduplicates multi-stage pairings and validates champion/standings', () => {
    const pairing = { pairingId: 'm1', status: 'completed' };
    const tournament = {
      format: 'multi_stage', status: 'completed', participants: [{ participantId: 'p1' }], standings: [{ participantId: 'p1' }],
      stages: [{ stageId: 's1', stageType: 'group_stage', status: 'completed', groups: [{ rounds: [{ pairings: [pairing] }] }] },
        { stageId: 's2', stageType: 'knockout', status: 'completed', rounds: [{ pairings: [pairing] }], advancement: { advancingParticipantIds: ['p1'] } }],
    };
    expect(flattenPairings(tournament)).toHaveLength(1);
    expect(validateBenchmarkOutcome(tournament, 1)).toMatchObject({ pairingCount: 1, champion: 'p1' });
  });
});
