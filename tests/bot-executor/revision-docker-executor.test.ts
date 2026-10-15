import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildCppCompileDockerArgs,
  buildCppRuntimeDockerArgs,
  buildPythonRuntimeDockerArgs,
  parseRevisionBotResult,
  createRuntimeImageRegistry,
  createRevisionDockerExecutor,
  buildStrategyCppVolumeCompileDockerArgs,
  buildCppVolumeRuntimeDockerArgs,
  resolveCppCompilationBackend,
  WorkspacePreparationError,
} from '@bot-executor/index.js';
import type { RevisionDockerExecutorConfig } from '@bot-executor/revision-docker-executor.js';
import { buildStrategyCppCompileDockerArgs, buildStrategyPythonRuntimeDockerArgs } from '@bot-executor/revision-docker-executor.js';
import { getStrategySdkIdentity, STRATEGY_SDK_VERSION } from '@bot-executor/strategy-sdk.js';

const digest = (name: string) => `ghcr.io/ott-code-arena/${name}@sha256:${'a'.repeat(64)}`;
const config = (): RevisionDockerExecutorConfig => ({
  imageRegistry: {
    cppCompilerImage: digest('cpp-compiler'),
    cppRuntimeImage: digest('cpp-runtime'),
    python3RuntimeImage: digest('python3-runtime'),
    trustedRegistries: ['ghcr.io'],
  },
  executionPolicy: 'sandbox-required',
  dockerBinary: 'docker',
});

const sourceRevision = (runtimeId: 'cpp' | 'python3', source: string) => ({
  execution: {
    kind: 'source-revision' as const,
    competitorId: 'competitor-1',
    botId: 'bot-1',
    revisionId: 'revision-1',
    runtimeId,
    sourceDigest: createHash('sha256').update(source).digest('hex'),
  },
  source: Buffer.from(source),
});

const request = {
  protocol_version: '0.1.0', match_id: 'match-1', turn: 1, player: 'A' as const,
  board_size: 9, pieces: [], legal_moves: [],
};

describe('source revision Docker adapter contracts', () => {
  it('keeps bind as the default and fails closed for unknown compilation backends', () => {
    expect(resolveCppCompilationBackend()).toBe('bind');
    expect(resolveCppCompilationBackend('bind')).toBe('bind');
    expect(resolveCppCompilationBackend('ephemeral-volume')).toBe('ephemeral-volume');
    expect(() => resolveCppCompilationBackend('volume')).toThrow(/Invalid C\+\+ compilation backend/);
    expect(() => createRevisionDockerExecutor({ ...config(), cppCompilationBackend: 'volume' as any })).toThrow();
  });

  it('builds isolated shell-free volume compile and runtime commands', () => {
    const compile = buildStrategyCppVolumeCompileDockerArgs(
      config(), 'volume-compile', 'ott-src-one', 'ott-sdk-one', 'ott-bin-one', 'eph-one',
    );
    const runtime = buildCppVolumeRuntimeDockerArgs(config(), 'volume-runtime', 'ott-bin-one', 'eph-one');
    expect(compile).toEqual(expect.arrayContaining([
      '--label', 'ott.source.workspace=eph-one',
      'ott-src-one:/app/source:ro', 'ott-sdk-one:/app/sdk:ro', 'ott-bin-one:/app/output:rw',
      'g++', '-std=c++17', '-static',
    ]));
    expect(runtime).toEqual(expect.arrayContaining([
      '--label', 'ott.source.workspace=eph-one', 'ott-bin-one:/app/bin:ro', '/app/bin/bot',
    ]));
    for (const args of [compile, runtime]) {
      expect(args).toEqual(expect.arrayContaining(['--network', 'none', '--read-only', '--cap-drop', 'ALL']));
      expect(args).not.toContain('sh');
      expect(args).not.toContain('-c');
    }
  });

  it('provides an immutable identity for each strategy SDK runtime', async () => {
    const cpp = await getStrategySdkIdentity('cpp');
    const python = await getStrategySdkIdentity('python3');
    expect(cpp.version).toBe(STRATEGY_SDK_VERSION);
    expect(python.version).toBe(STRATEGY_SDK_VERSION);
    expect(cpp.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(python.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(cpp.digest).not.toBe(python.digest);
  });

  it('keeps strategy SDK mounts read-only and uses fixed platform entrypoints', () => {
    const cpp = buildStrategyCppCompileDockerArgs(config(), 'strategy-compile', 'C:\\source', 'C:\\sdk', 'C:\\output');
    const python = buildStrategyPythonRuntimeDockerArgs(config(), 'strategy-run', 'C:\\source', 'C:\\sdk');
    expect(cpp).toContain('C:\\sdk:/app/sdk:ro');
    expect(cpp).toContain('/app/sdk');
    expect(python).toContain('C:\\sdk:/app/sdk:ro');
    expect(python).toEqual(expect.arrayContaining(['python3', '-B', '/app/sdk/runner.py', '/app/source/strategy.py']));
  });

  it('requires all source runtime images to be immutable and trusted', () => {
    expect(() => createRuntimeImageRegistry({
      trustedRegistries: ['ghcr.io'],
      cppCompilerImage: 'ghcr.io/ott-code-arena/compiler:latest',
      cppRuntimeImage: digest('cpp-runtime'),
      python3RuntimeImage: digest('python3-runtime'),
    })).toThrow(/immutable/);

    expect(() => createRuntimeImageRegistry({
      trustedRegistries: ['docker.io'],
      cppCompilerImage: digest('cpp-compiler'),
      cppRuntimeImage: digest('cpp-runtime'),
      python3RuntimeImage: digest('python3-runtime'),
    })).toThrow(/trusted registry/);
  });

  it('builds a shell-free fixed C++ compile command with isolation controls', () => {
    const args = buildCppCompileDockerArgs(config(), 'exec-1', 'C:\\safe\\source', 'C:\\safe\\output');
    expect(args).toContain('--network');
    expect(args).toContain('none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--user');
    expect(args).toContain('g++');
    expect(args).toContain('-std=c++17');
    expect(args).toContain('-static');
    expect(args).toContain('/app/source/main.cpp');
    expect(args).toContain('/app/output/bot');
    expect(args).not.toContain('sh');
    expect(args).not.toContain('-c');
    expect(args[args.indexOf('g++') - 1]).toMatch(/@sha256:/);
  });

  it('uses fixed non-shell runtime entrypoints for C++ and Python', () => {
    const cpp = buildCppRuntimeDockerArgs(config(), 'exec-2', 'C:\\safe\\output');
    const python = buildPythonRuntimeDockerArgs(config(), 'exec-3', 'C:\\safe\\source');
    expect(cpp).toContain('/app/bin/bot');
    expect(python).toContain('python3');
    expect(python).toContain('-B');
    expect(python).toContain('/app/source/main.py');
    for (const args of [cpp, python]) {
      expect(args).toContain('-i');
      expect(args).not.toContain('sh');
      expect(args).not.toContain('-c');
      expect(args).toContain('--network');
      expect(args).toContain('none');
      expect(args).toContain('--cap-drop');
      expect(args).toContain('ALL');
      expect(args).toContain('no-new-privileges:true');
    }
  });

  it('rejects unsafe execution identifiers before constructing commands', () => {
    expect(() => buildPythonRuntimeDockerArgs(config(), '../escape', 'C:\\safe\\source')).toThrow(/Unsafe/);
  });

  it('classifies source Bot protocol failures without accepting unsafe coordinates', () => {
    const valid = parseRevisionBotResult('{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}\n', '', 0);
    expect(valid.success).toBe(true);

    expect(parseRevisionBotResult('', '', 0).error?.code).toBe('EMPTY_OUTPUT');
    expect(parseRevisionBotResult('not-json\n', '', 0).error?.code).toBe('INVALID_JSON');
    expect(parseRevisionBotResult('{"move":{"piece_id":"A-dam-1","from":"z1","to":"c2"}}', '', 0).error?.code).toBe('INVALID_MOVE');
    expect(parseRevisionBotResult('{"move":{"piece_id":"A-dam-1","from":"c1","to":"c1"}}', '', 0).error?.code).toBe('INVALID_MOVE');
  });

  it('fails closed with a bounded infrastructure error when Docker is unavailable', async () => {
    const executor = createRevisionDockerExecutor({ ...config(), dockerBinary: '__missing_docker_for_source_test__' });
    await expect(executor.executeRevision(
      { executionId: 'unavailable-1', matchId: 'match-1', turn: 1, player: 'A' },
      sourceRevision('python3', 'print("ok")'),
      request,
    )).resolves.toMatchObject({
      success: false,
      error: { code: 'EXECUTOR_ERROR', stage: 'docker_infrastructure' },
    });
  });

  it('classifies a genuine compiler nonzero exit as a Bot compilation failure', async () => {
    const executor = createRevisionDockerExecutor(config()) as any;
    vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(executor, 'runContainer').mockResolvedValue({
      code: 1, stdout: '', stderr: 'main.cpp:1: error: expected expression',
      timedOut: false, killed: false, cancelled: false,
    });
    const result = await executor.executeRevision(
      { executionId: 'compile-failure-1', matchId: 'match-1', turn: 1, player: 'A' },
      sourceRevision('cpp', 'int main( {'),
      request,
    );
    expect(result.error?.code).toBe('PROCESS_CRASHED');
    expect(result.error?.message).toBe('C++ compilation failed');
    expect(result.error?.stage).toBe('compilation');
  });

  it('accepts a successful compiled/runtime protocol result without host fallback', async () => {
    const executor = createRevisionDockerExecutor(config()) as any;
    vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
    const run = vi.spyOn(executor, 'runContainer');
    run.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false });
    run.mockResolvedValueOnce({
      code: 0,
      stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}\n',
      stderr: '', timedOut: false, killed: false, cancelled: false,
    });
    const result = await executor.executeRevision(
      { executionId: 'success-1', matchId: 'match-1', turn: 1, player: 'A' },
      sourceRevision('cpp', 'int main() { return 0; }'),
      request,
    );
    expect(result.success).toBe(true);
    expect(result.response?.move.to).toBe('c2');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('compiles once per revision scope and releases the retained artifact', async () => {
    const workingDirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-revision-scope-'));
    try {
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      const run = vi.spyOn(executor, 'runContainer');
      run.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false });
      run.mockResolvedValueOnce({ code: 0, stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}\n', stderr: '', timedOut: false, killed: false, cancelled: false });
      run.mockResolvedValueOnce({ code: 0, stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}\n', stderr: '', timedOut: false, killed: false, cancelled: false });
      const revision = sourceRevision('cpp', 'int main() { return 0; }');
      const first = await executor.executeRevision(
        { executionId: 'scoped-turn-1', matchId: 'match-scope', turn: 1, player: 'A', revisionScopeId: 'match-scope' }, revision, request,
      );
      const second = await executor.executeRevision(
        { executionId: 'scoped-turn-2', matchId: 'match-scope', turn: 2, player: 'A', revisionScopeId: 'match-scope' }, revision, request,
      );
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(run).toHaveBeenCalledTimes(3);
      expect(run.mock.calls.filter(call => String(call[0]).endsWith('-compile'))).toHaveLength(1);
      expect(executor.preparedArtifacts.size).toBe(1);
      expect(await executor.releaseRevisionScope('match-scope')).toBe(true);
      expect(executor.preparedArtifacts.size).toBe(0);
      await expect(fs.stat(path.join(workingDirBase, 'source-exec', 'scoped-turn-1'))).rejects.toThrow();
    } finally {
      await fs.rm(workingDirBase, { recursive: true, force: true });
    }
  });

  it('executes a pinned strategy revision through the SDK wrapper path', async () => {
    const workingDirBase = await fs.mkdtemp(`${os.tmpdir()}\\ott-sdk-test-`);
    try {
      const sdk = await getStrategySdkIdentity('cpp');
      const source = 'Move chooseMove(const GameState&, const std::vector<Move>& moves) { return moves.front(); }';
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      const run = vi.spyOn(executor, 'runContainer');
      run.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false });
      run.mockResolvedValueOnce({ code: 0, stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}\n', stderr: '', timedOut: false, killed: false, cancelled: false });
      const result = await executor.executeRevision(
        { executionId: 'strategy-1', matchId: 'match-1', turn: 1, player: 'A' },
        { execution: { ...sourceRevision('cpp', source).execution, executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest }, source: Buffer.from(source) },
        request,
      );
      expect(result.success).toBe(true);
      expect(run.mock.calls[0]?.[1]).toContain('/app/sdk');
      expect(run.mock.calls[1]?.[1]).toContain('/app/bin/bot');
    } finally {
      await fs.rm(workingDirBase, { recursive: true, force: true });
    }
  });

  it('rejects a strategy revision whose SDK digest is not the trusted artifact', async () => {
    const sdk = await getStrategySdkIdentity('python3');
    const executor = createRevisionDockerExecutor(config()) as any;
    vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
    const result = await executor.executeRevision(
      { executionId: 'strategy-bad-sdk', matchId: 'match-1', turn: 1, player: 'A' },
      { execution: { ...sourceRevision('python3', 'def choose_move(state, legal_moves):\n    return legal_moves[0]\n').execution, executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: '0'.repeat(64) }, source: Buffer.from('def choose_move(state, legal_moves):\n    return legal_moves[0]\n') },
      request,
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SECURITY_VIOLATION');
  });

  it.each(['compilation', 'runtime'] as const)('identifies a %s timeout and preserves both configured budgets', async phase => {
    const workingDirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-source-timing-'));
    try {
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      const run = vi.spyOn(executor, 'runContainer');
      if (phase === 'runtime') run.mockResolvedValueOnce({
        code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false,
        elapsedMs: 25_000, cleanupMs: 10, cleanupSucceeded: true,
      });
      run.mockResolvedValueOnce({
        code: null, stdout: '', stderr: '', timedOut: true, killed: true, cancelled: false,
        elapsedMs: phase === 'compilation' ? 30_000 : 2_000, cleanupMs: 20, cleanupSucceeded: true,
      });
      const result = await executor.executeRevision(
        { executionId: 'timed-source', matchId: 'match', turn: 1, player: 'A' },
        sourceRevision('cpp', 'int main() { return 0; }'), request,
      );
      expect(result).toMatchObject({
        success: false, timedOut: true,
        error: phase === 'compilation'
          ? { code: 'COMPILATION_TIMEOUT', stage: 'compilation_timeout' }
          : { code: 'RUNTIME_TIMEOUT', stage: 'runtime_timeout' },
        timings: { timeoutPhase: phase, compileBudgetMs: 30_000, runtimeBudgetMs: 2_000, cleanupSucceeded: true },
      });
      expect(run.mock.calls[0]?.[3]).toBe(30_000);
      if (phase === 'runtime') expect(run.mock.calls[1]?.[3]).toBe(2_000);
      else {
        expect(run).toHaveBeenCalledTimes(1);
        expect(result.timings?.runtimeContainerMs).toBeNull();
        expect(result.response).toBeUndefined();
      }
      await expect(fs.stat(path.join(workingDirBase, 'source-exec', 'timed-source'))).rejects.toThrow();
    } finally { await fs.rm(workingDirBase, { recursive: true, force: true }); }
  });

  it('awaits owned timeout termination before final removal and releasing its running entry', async () => {
    // A harmless Node fixture exercises the real process/timer lifecycle.
    // It is not submitted Bot source and does not emulate Docker execution.
    const executor = createRevisionDockerExecutor({ ...config(), dockerBinary: process.execPath }) as any;
    let finishKill: ((value: string) => void) | undefined;
    const commands = vi.spyOn(executor, 'dockerCommand').mockImplementation((args: unknown) => {
      if ((args as string[])[0] === 'kill') return new Promise<string>(resolve => { finishKill = resolve; });
      return Promise.resolve('');
    });
    let settled = false;
    const pending = executor.runContainer('owned-timeout-fixture', ['-e', 'setInterval(() => {}, 1000)'], undefined, 50)
      .then((result: unknown) => { settled = true; return result; });
    try {
      await vi.waitFor(() => expect(finishKill).toBeDefined());
      const running = executor.running.get('owned-timeout-fixture');
      running.process.kill(); // Simulate attached CLI closing before docker kill settles.
      await vi.waitFor(() => expect(running.resolved).toBe(true));
      expect(settled).toBe(false);
      expect(executor.running.has('owned-timeout-fixture')).toBe(true);
      expect(commands.mock.calls.some(call => (call[0] as string[])[0] === 'rm')).toBe(false);
      finishKill!('');
      expect(await pending).toMatchObject({ timedOut: true, cleanupSucceeded: true });
      expect(executor.running.size).toBe(0);
      expect(commands).toHaveBeenCalledWith(['rm', '--force', 'ott-source-owned-timeout-fixture']);
    } finally {
      finishKill?.('');
      const running = executor.running.get('owned-timeout-fixture');
      running?.process.kill();
      await pending;
    }
  });

  it('reports cleanup failures while recognizing normal --rm cleanup as successful', async () => {
    const executor = createRevisionDockerExecutor(config()) as any;
    const commands = vi.spyOn(executor, 'dockerCommand');
    commands.mockRejectedValueOnce(new Error('Error response from daemon: No such container: owned'));
    expect(await executor.removeContainer('owned')).toBe(true);
    commands.mockRejectedValueOnce(new Error('Docker daemon unavailable'));
    expect(await executor.removeContainer('owned')).toBe(false);
  });

  it('uses unique ephemeral workspaces and preserves bounded provenance for concurrent strategy jobs', async () => {
    const workingDirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-volume-concurrent-'));
    try {
      const sdk = await getStrategySdkIdentity('cpp');
      const executor = createRevisionDockerExecutor({
        ...config(), workingDirBase, cppCompilationBackend: 'ephemeral-volume',
      }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      const prepared: Array<{ marker: string; sourceVolume: string; outputVolume: string }> = [];
      vi.spyOn(executor, 'prepareVolumeWorkspace').mockImplementation(async (workspace: any) => { prepared.push(workspace); });
      vi.spyOn(executor, 'validateVolumeArtifact').mockResolvedValue('b'.repeat(64));
      vi.spyOn(executor, 'cleanupVolumeWorkspace').mockResolvedValue(true);
      vi.spyOn(executor, 'runContainer').mockImplementation(async (executionId: string) => executionId.endsWith('-compile')
        ? { code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false, elapsedMs: 5, cleanupMs: 1, cleanupSucceeded: true }
        : { code: 0, stdout: '{"move":{"piece_id":"A-rock-1","from":"a1","to":"a2"}}\n', stderr: '', timedOut: false, killed: false, cancelled: false, elapsedMs: 2, cleanupMs: 1, cleanupSucceeded: true });
      const makeRevision = (source: string, suffix: string) => ({
        execution: {
          ...sourceRevision('cpp', source).execution,
          botId: `bot-${suffix}`, revisionId: `revision-${suffix}`,
          executionMode: 'strategy' as const, sdkVersion: sdk.version, sdkDigest: sdk.digest,
        },
        source: Buffer.from(source),
      });
      const [first, second] = await Promise.all([
        executor.executeRevision({ executionId: 'concurrent-a', matchId: 'match', turn: 1, player: 'A' }, makeRevision('Move chooseMove(const GameState&, const std::vector<Move>& m){return m.front();}', 'a'), request),
        executor.executeRevision({ executionId: 'concurrent-b', matchId: 'match', turn: 1, player: 'B' }, makeRevision('Move chooseMove(const GameState&, const std::vector<Move>& m){return m.back();}', 'b'), request),
      ]);
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(new Set(prepared.map(item => item.marker)).size).toBe(2);
      expect(new Set(prepared.flatMap(item => [item.sourceVolume, item.outputVolume])).size).toBe(4);
      expect(first.provenance).toMatchObject({ compilationBackend: 'ephemeral-volume', artifactDigest: 'b'.repeat(64) });
      expect(first.timings).toMatchObject({ preparationBudgetMs: 10_000, timeoutPhase: null, cleanupSucceeded: true });
    } finally { await fs.rm(workingDirBase, { recursive: true, force: true }); }
  });

  it('classifies volume staging timeout separately and still cleans owned volumes', async () => {
    const workingDirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-volume-timeout-'));
    try {
      const sdk = await getStrategySdkIdentity('cpp');
      const source = 'Move chooseMove(const GameState&, const std::vector<Move>& m){return m.front();}';
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase, cppCompilationBackend: 'ephemeral-volume' }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      vi.spyOn(executor, 'prepareVolumeWorkspace').mockRejectedValue(new WorkspacePreparationError('staging timed out', true));
      const cleanup = vi.spyOn(executor, 'cleanupVolumeWorkspace').mockResolvedValue(true);
      const result = await executor.executeRevision(
        { executionId: 'volume-stage-fail', matchId: 'match', turn: 1, player: 'A' },
        { execution: { ...sourceRevision('cpp', source).execution, executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest }, source: Buffer.from(source) },
        request,
      );
      expect(result).toMatchObject({
        success: false, timedOut: true,
        error: { code: 'EXECUTOR_ERROR', stage: 'workspace_preparation_timeout' },
        timings: { timeoutPhase: 'preparation' },
      });
      expect(cleanup).toHaveBeenCalledOnce();
    } finally { await fs.rm(workingDirBase, { recursive: true, force: true }); }
  });

  it('rejects a missing or malformed volume artifact before runtime', async () => {
    const workingDirBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-volume-artifact-'));
    try {
      const sdk = await getStrategySdkIdentity('cpp');
      const source = 'Move chooseMove(const GameState&, const std::vector<Move>& m){return m.front();}';
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase, cppCompilationBackend: 'ephemeral-volume' }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      vi.spyOn(executor, 'prepareVolumeWorkspace').mockResolvedValue(undefined);
      vi.spyOn(executor, 'validateVolumeArtifact').mockRejectedValue(new Error('not ELF'));
      vi.spyOn(executor, 'cleanupVolumeWorkspace').mockResolvedValue(true);
      const run = vi.spyOn(executor, 'runContainer').mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false, elapsedMs: 1, cleanupMs: 0, cleanupSucceeded: true });
      const result = await executor.executeRevision(
        { executionId: 'volume-bad-artifact', matchId: 'match', turn: 1, player: 'A' },
        { execution: { ...sourceRevision('cpp', source).execution, executionMode: 'strategy', sdkVersion: sdk.version, sdkDigest: sdk.digest }, source: Buffer.from(source) },
        request,
      );
      expect(result.error).toMatchObject({ code: 'EXECUTOR_ERROR', stage: 'artifact_validation' });
      expect(run).toHaveBeenCalledTimes(1);
    } finally { await fs.rm(workingDirBase, { recursive: true, force: true }); }
  });

  it('detects staged source/SDK digest substitution before compilation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-volume-digest-'));
    try {
      const sourceDir = path.join(root, 'source'); const sdkDir = path.join(root, 'sdk');
      await fs.mkdir(sourceDir); await fs.mkdir(sdkDir);
      await fs.writeFile(path.join(sourceDir, 'strategy.cpp'), 'trusted source');
      await fs.writeFile(path.join(sdkDir, 'VERSION'), '1.0.0');
      await fs.writeFile(path.join(sdkDir, 'ott_strategy_sdk.hpp'), 'trusted sdk');
      const executor = createRevisionDockerExecutor({ ...config(), cppCompilationBackend: 'ephemeral-volume' }) as any;
      vi.spyOn(executor, 'dockerCommandBounded').mockResolvedValue('');
      const run = vi.spyOn(executor, 'runContainer');
      for (let index = 0; index < 3; index++) run.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', timedOut: false, cancelled: false });
      run.mockResolvedValueOnce({
        code: 0, stdout: `${'0'.repeat(64)}  /app/source/strategy.cpp\n${'0'.repeat(64)}  /app/sdk/VERSION\n${'0'.repeat(64)}  /app/sdk/ott_strategy_sdk.hpp\n`,
        stderr: '', timedOut: false, cancelled: false,
      });
      await expect(executor.prepareVolumeWorkspace(executor.newVolumeWorkspace(), sourceDir, sdkDir))
        .rejects.toThrow(/digest mismatch/);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('rejects symlink or malformed artifact metadata before ELF inspection', async () => {
    const executor = createRevisionDockerExecutor({ ...config(), cppCompilationBackend: 'ephemeral-volume' }) as any;
    const run = vi.spyOn(executor, 'runContainer').mockResolvedValue({
      code: 0, stdout: 'symbolic link|777|65532|65532|1234\n', stderr: '', timedOut: false, cancelled: false,
    });
    await expect(executor.validateVolumeArtifact(executor.newVolumeWorkspace())).rejects.toThrow(/metadata/);
    expect(run).toHaveBeenCalledOnce();
  });

  it('refuses cleanup when a volume ownership label does not match', async () => {
    const executor = createRevisionDockerExecutor({ ...config(), cppCompilationBackend: 'ephemeral-volume' }) as any;
    const workspace = executor.newVolumeWorkspace();
    const docker = vi.spyOn(executor, 'dockerCommandBounded').mockResolvedValue('another-job');
    await expect(executor.cleanupVolumeWorkspace(workspace)).resolves.toBe(false);
    expect(docker).toHaveBeenCalledTimes(3);
    expect(docker.mock.calls.some(call => (call[0] as string[]).includes('rm'))).toBe(false);
  });

  it('does not route raw C++ or Python Strategy through the volume compiler', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-volume-compat-'));
    try {
      const executor = createRevisionDockerExecutor({ ...config(), workingDirBase: root, cppCompilationBackend: 'ephemeral-volume' }) as any;
      vi.spyOn(executor, 'isAvailable').mockResolvedValue(true);
      const prepare = vi.spyOn(executor, 'prepareVolumeWorkspace');
      const run = vi.spyOn(executor, 'runContainer');
      run.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '', timedOut: false, killed: false, cancelled: false });
      run.mockResolvedValueOnce({ code: 0, stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}', stderr: '', timedOut: false, killed: false, cancelled: false });
      const raw = await executor.executeRevision(
        { executionId: 'raw-compat', matchId: 'match', turn: 1, player: 'A' }, sourceRevision('cpp', 'int main(){return 0;}'), request,
      );
      const pySdk = await getStrategySdkIdentity('python3');
      const pySource = 'def choose_move(state, legal_moves):\n    return legal_moves[0]\n';
      run.mockResolvedValueOnce({ code: 0, stdout: '{"move":{"piece_id":"A-dam-1","from":"c1","to":"c2"}}', stderr: '', timedOut: false, killed: false, cancelled: false });
      const python = await executor.executeRevision(
        { executionId: 'python-compat', matchId: 'match', turn: 1, player: 'A' },
        { execution: { ...sourceRevision('python3', pySource).execution, executionMode: 'strategy', sdkVersion: pySdk.version, sdkDigest: pySdk.digest }, source: Buffer.from(pySource) }, request,
      );
      expect(raw.success).toBe(true);
      expect(python.success).toBe(true);
      expect(raw.provenance?.compilationBackend).toBe('bind');
      expect(python.provenance?.compilationBackend).toBe('bind');
      expect(prepare).not.toHaveBeenCalled();
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
