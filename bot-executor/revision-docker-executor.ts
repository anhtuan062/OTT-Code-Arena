import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SourceRevisionExecution } from '@match-runner/types.js';
import type {
  BotExecutionResult,
  BotErrorCode,
  BotFailureStage,
  BotRequestMessage,
  ExecutionContext,
  ResourceLimits,
  RevisionExecutionTimings,
  RevisionExecutionProvenance,
  CppCompilationBackend,
} from './types.js';
import { ExecutionCancelledError } from './types.js';
import { validateDockerImage } from './image-config.js';
import type { ExecutionPolicy } from './types.js';
import type { RuntimeImageRegistry } from './runtime-image-registry.js';
import { createRuntimeImageRegistry } from './runtime-image-registry.js';
import { getStrategySdkIdentity, materializeStrategySdk, wrapCppStrategySource } from './strategy-sdk.js';

export interface RevisionSource {
  execution: SourceRevisionExecution;
  source: Buffer;
}

export interface RevisionDockerExecutorConfig {
  imageRegistry: RuntimeImageRegistry;
  executionPolicy?: ExecutionPolicy;
  dockerBinary?: string;
  workingDirBase?: string;
  memoryLimit?: string;
  cpuLimit?: number;
  pidsLimit?: number;
  defaultCompileTimeoutMs?: number;
  defaultPreparationTimeoutMs?: number;
  defaultTimeoutMs?: number;
  nonRootUser?: string;
  cppCompilationBackend?: CppCompilationBackend;
}

interface EphemeralVolumeWorkspace {
  jobId: string;
  marker: string;
  sourceVolume: string;
  sdkVolume: string;
  outputVolume: string;
}

export class WorkspacePreparationError extends Error {
  constructor(message: string, readonly timedOut = false) {
    super(message);
    this.name = 'WorkspacePreparationError';
  }
}

interface RunningProcess {
  containerId: string;
  process: ChildProcess;
  killed: boolean;
  resolved: boolean;
  termination: Promise<void> | null;
}

const NON_ROOT_USER = '65532:65532';
const SOURCE_DIR = '/app/source';
const OUTPUT_DIR = '/app/output';
const COMPILED_BINARY_PATH = `${OUTPUT_DIR}/bot`;
const BINARY_PATH = '/app/bin/bot';
const COMPILER_FLAGS = ['-std=c++17', '-O2', '-pipe', '-s', '-static'] as const;
const WORKSPACE_LABEL = 'ott.source.workspace';
const ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;

export function resolveCppCompilationBackend(value?: string): CppCompilationBackend {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'bind') return 'bind';
  if (normalized === 'ephemeral-volume') return 'ephemeral-volume';
  throw new Error(`Invalid C++ compilation backend: ${value}`);
}

function assertSafeId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Unsafe execution identifier');
}

function mount(hostPath: string, containerPath: string, mode: 'ro' | 'rw'): string {
  // Docker receives this as one argument. No user-controlled shell syntax is
  // interpreted because the adapter never invokes sh/cmd/powershell.
  return `${hostPath}:${containerPath}:${mode}`;
}

function volumeMount(volumeName: string, containerPath: string, mode: 'ro' | 'rw'): string {
  assertSafeId(volumeName);
  return `${volumeName}:${containerPath}:${mode}`;
}

function securityArgs(config: RevisionDockerExecutorConfig, executionId: string): string[] {
  return [
    'run', '-i', '--rm', '--pull=never', '--name', `ott-source-${executionId}`,
    '--network', 'none', '--memory', config.memoryLimit ?? '256m',
    '--cpus', String(config.cpuLimit ?? 1), '--pids-limit', String(config.pidsLimit ?? 64),
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=10m',
    '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL',
    '--user', config.nonRootUser ?? NON_ROOT_USER,
  ];
}

export function buildCppCompileDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  outputDir: string
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    '-v', mount(outputDir, '/app/output', 'rw'),
    config.imageRegistry.cppCompilerImage,
    'g++', ...COMPILER_FLAGS, `${SOURCE_DIR}/main.cpp`, '-o', COMPILED_BINARY_PATH,
  ];
}

export function buildCppRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  outputDir: string
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId),
    '-v', mount(outputDir, '/app/bin', 'ro'),
    config.imageRegistry.cppRuntimeImage,
    BINARY_PATH,
  ];
}

export function buildPythonRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    config.imageRegistry.python3RuntimeImage,
    'python3', '-B', `${SOURCE_DIR}/main.py`,
  ];
}

export function buildStrategyCppCompileDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  sdkDir: string,
  outputDir: string
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    '-v', mount(sdkDir, '/app/sdk', 'ro'),
    '-v', mount(outputDir, '/app/output', 'rw'),
    config.imageRegistry.cppCompilerImage,
    'g++', ...COMPILER_FLAGS,
    `${SOURCE_DIR}/strategy.cpp`, '-I', '/app/sdk', '-o', COMPILED_BINARY_PATH,
  ];
}

export function buildStrategyCppVolumeCompileDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceVolume: string,
  sdkVolume: string,
  outputVolume: string,
  workspaceMarker?: string,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`),
    ...(workspaceMarker ? ['--label', `${WORKSPACE_LABEL}=${workspaceMarker}`] : []),
    '--platform', 'linux/amd64',
    '-v', volumeMount(sourceVolume, SOURCE_DIR, 'ro'),
    '-v', volumeMount(sdkVolume, '/app/sdk', 'ro'),
    '-v', volumeMount(outputVolume, OUTPUT_DIR, 'rw'),
    config.imageRegistry.cppCompilerImage,
    'g++', ...COMPILER_FLAGS,
    `${SOURCE_DIR}/strategy.cpp`, '-I', '/app/sdk', '-o', COMPILED_BINARY_PATH,
  ];
}

export function buildCppVolumeRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  outputVolume: string,
  workspaceMarker?: string,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId),
    ...(workspaceMarker ? ['--label', `${WORKSPACE_LABEL}=${workspaceMarker}`] : []),
    '--platform', 'linux/amd64',
    '-v', volumeMount(outputVolume, '/app/bin', 'ro'),
    config.imageRegistry.cppRuntimeImage,
    BINARY_PATH,
  ];
}

export function buildStrategyPythonRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  sdkDir: string
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    '-v', mount(sdkDir, '/app/sdk', 'ro'),
    config.imageRegistry.python3RuntimeImage,
    'python3', '-B', '/app/sdk/runner.py', '/app/source/strategy.py',
  ];
}

export class RevisionDockerExecutor {
  private readonly config: RevisionDockerExecutorConfig;
  private readonly running = new Map<string, RunningProcess>();
  private available = false;

  constructor(config: RevisionDockerExecutorConfig) {
    this.config = {
      dockerBinary: 'docker',
      workingDirBase: process.cwd(),
      executionPolicy: 'sandbox-required',
      defaultPreparationTimeoutMs: 10_000,
      cppCompilationBackend: 'bind',
      ...config,
    };
    this.config.cppCompilationBackend = resolveCppCompilationBackend(config.cppCompilationBackend);
    // Validate the registry allowlist even when callers construct the class
    // directly; the exported factory is not the only possible entry point.
    this.config.imageRegistry = createRuntimeImageRegistry(this.config.imageRegistry, this.config.executionPolicy);
    for (const image of [this.config.imageRegistry.cppCompilerImage, this.config.imageRegistry.cppRuntimeImage, this.config.imageRegistry.python3RuntimeImage]) {
      validateDockerImage(image, this.config.executionPolicy);
    }
  }

  getName(): string { return 'docker-source-revision'; }

  getSupportedLimits(): ResourceLimits {
    return {
      maxMemoryBytes: 256 * 1024 * 1024,
      maxProcesses: this.config.pidsLimit ?? 64,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this.available) return true;
    try {
      await this.dockerCommand(['version', '--format', '{{.Server.Version}}']);
      for (const image of [this.config.imageRegistry.cppCompilerImage, this.config.imageRegistry.cppRuntimeImage, this.config.imageRegistry.python3RuntimeImage]) {
        await this.dockerCommand(['image', 'inspect', image]);
      }
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  async executeRevision(
    context: ExecutionContext,
    revision: RevisionSource,
    request: BotRequestMessage
  ): Promise<BotExecutionResult> {
    const started = performance.now();
    const timings: RevisionExecutionTimings = {
      imageReadinessMs: 0, workspacePreparationMs: null, compilationContainerMs: null,
      artifactValidationMs: null, runtimeContainerMs: null,
      runtimeStartupMs: null, botExecutionMs: null, cleanupMs: 0, cleanupSucceeded: true,
      totalMs: 0, preparationBudgetMs: this.config.defaultPreparationTimeoutMs ?? 10_000,
      compileBudgetMs: this.config.defaultCompileTimeoutMs ?? 30_000,
      runtimeBudgetMs: this.config.defaultTimeoutMs ?? 2_000, timeoutPhase: null,
    };
    const provenance: RevisionExecutionProvenance = {
      compilationBackend: this.activeBackend(revision.execution),
      sourceDigest: revision.execution.sourceDigest,
      ...(revision.execution.sdkVersion ? { sdkVersion: revision.execution.sdkVersion } : {}),
      ...(revision.execution.sdkDigest ? { sdkDigest: revision.execution.sdkDigest } : {}),
      ...(revision.execution.runtimeId === 'cpp' ? {
        compilerImageDigest: this.imageDigest(this.config.imageRegistry.cppCompilerImage),
        compilerConfigDigest: this.compilerConfigDigest(),
      } : {}),
    };
    const result = await this.executeMeasuredRevision(context, revision, request, timings, provenance);
    timings.totalMs = Math.round(performance.now() - started);
    return { ...result, durationMs: timings.totalMs, timings, provenance };
  }

  private async executeMeasuredRevision(
    context: ExecutionContext,
    revision: RevisionSource,
    request: BotRequestMessage,
    timings: RevisionExecutionTimings,
    provenance: RevisionExecutionProvenance,
  ): Promise<BotExecutionResult> {
    assertSafeId(context.executionId);
    if (revision.execution.kind !== 'source-revision' || !['cpp', 'python3'].includes(revision.execution.runtimeId)) {
      return this.error('SECURITY_VIOLATION', 'Unsupported or malformed source revision metadata', null, '', '', false, 'source_integrity');
    }
    if (!/^[a-f0-9]{64}$/.test(revision.execution.sourceDigest)) {
      return this.error('SECURITY_VIOLATION', 'Pinned source digest is malformed', null, '', '', false, 'source_integrity');
    }
    if (context.signal?.aborted) throw new ExecutionCancelledError();
    if (createHash('sha256').update(revision.source).digest('hex') !== revision.execution.sourceDigest) {
      return this.error('SECURITY_VIOLATION', 'Source digest does not match the pinned revision', null, '', '', false, 'source_integrity');
    }
    const readinessStarted = performance.now();
    const available = await this.isAvailable();
    timings.imageReadinessMs = Math.round(performance.now() - readinessStarted);
    if (!available) return this.error('EXECUTOR_ERROR', 'Docker source runtime is unavailable', null, '', '', false, 'docker_infrastructure');

    const root = path.join(this.config.workingDirBase!, 'source-exec', context.executionId);
    const sourceDir = path.join(root, 'source');
    const sdkDir = path.join(root, 'sdk');
    const outputDir = path.join(root, 'output');
    const sourceName = revision.execution.runtimeId === 'cpp' ? 'main.cpp' : 'main.py';
    let volumeWorkspace: EphemeralVolumeWorkspace | undefined;
    try {
      await fs.mkdir(sourceDir, { recursive: true, mode: 0o700 });
      await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
      const strategy = revision.execution.executionMode === 'strategy';
      if (strategy) {
        const expectedSdk = await getStrategySdkIdentity(revision.execution.runtimeId);
        if (revision.execution.sdkVersion !== expectedSdk.version || revision.execution.sdkDigest !== expectedSdk.digest) {
          return this.error('SECURITY_VIOLATION', 'Pinned strategy SDK identity is unavailable or mismatched', null, '', '', false, 'sdk_resolution');
        }
        await materializeStrategySdk(revision.execution.runtimeId, sdkDir);
        if (revision.execution.runtimeId === 'cpp') {
          const wrapper = wrapCppStrategySource(revision.source.toString('utf8'));
          await fs.writeFile(path.join(sourceDir, 'strategy.cpp'), wrapper, { mode: 0o600 });
        } else {
          await fs.writeFile(path.join(sourceDir, 'strategy.py'), revision.source, { mode: 0o600 });
        }
      } else {
        await fs.writeFile(path.join(sourceDir, sourceName), revision.source, { mode: 0o600 });
      }
      if (revision.execution.runtimeId === 'cpp') {
        const useVolume = strategy && this.config.cppCompilationBackend === 'ephemeral-volume';
        if (useVolume) {
          volumeWorkspace = this.newVolumeWorkspace();
          const preparationStarted = performance.now();
          try {
            await this.prepareVolumeWorkspace(volumeWorkspace, sourceDir, sdkDir, context.signal);
          } catch (error) {
            timings.workspacePreparationMs = Math.round(performance.now() - preparationStarted);
            if (error instanceof ExecutionCancelledError) throw error;
            const timedOut = error instanceof WorkspacePreparationError && error.timedOut;
            if (timedOut) timings.timeoutPhase = 'preparation';
            return this.error(
              'EXECUTOR_ERROR',
              timedOut ? 'Ephemeral compilation workspace preparation timed out' : 'Ephemeral compilation workspace preparation failed',
              null, '', '', timedOut,
              timedOut ? 'workspace_preparation_timeout' : 'workspace_preparation',
            );
          }
          timings.workspacePreparationMs = Math.round(performance.now() - preparationStarted);
        }
        const compileStarted = performance.now();
        const compile = await this.runContainer(
          `${context.executionId}-compile`,
          useVolume && volumeWorkspace
            ? buildStrategyCppVolumeCompileDockerArgs(this.config, context.executionId, volumeWorkspace.sourceVolume, volumeWorkspace.sdkVolume, volumeWorkspace.outputVolume, volumeWorkspace.marker)
            : strategy
            ? buildStrategyCppCompileDockerArgs(this.config, context.executionId, sourceDir, sdkDir, outputDir)
            : buildCppCompileDockerArgs(this.config, context.executionId, sourceDir, outputDir),
          undefined,
          this.config.defaultCompileTimeoutMs ?? 30_000,
          context.signal
        );
        timings.compilationContainerMs = compile.elapsedMs ?? Math.round(performance.now() - compileStarted);
        timings.cleanupMs += compile.cleanupMs ?? 0;
        timings.cleanupSucceeded &&= compile.cleanupSucceeded !== false;
        if (compile.timedOut) timings.timeoutPhase = 'compilation';
        if (compile.cancelled) throw new ExecutionCancelledError();
        if (compile.timedOut) return this.error('COMPILATION_TIMEOUT', 'C++ compilation timed out', compile.code, compile.stdout, compile.stderr, true, 'compilation_timeout');
        if (compile.killed) return this.error('RESOURCE_LIMIT_EXCEEDED', 'C++ compiler exceeded a resource limit', compile.code, compile.stdout, compile.stderr, false, 'resource_limit');
        if (compile.code === -1 && compile.stderr.includes('Docker error:')) return this.error('EXECUTOR_ERROR', 'Docker compiler runtime failed before compilation completed', compile.code, compile.stdout, compile.stderr, false, 'docker_infrastructure');
        if (compile.code !== 0) return this.error('PROCESS_CRASHED', 'C++ compilation failed', compile.code, compile.stdout, compile.stderr, false, 'compilation');
        if (useVolume && volumeWorkspace) {
          const validationStarted = performance.now();
          try {
            provenance.artifactDigest = await this.validateVolumeArtifact(volumeWorkspace, context.signal);
          } catch (error) {
            timings.artifactValidationMs = Math.round(performance.now() - validationStarted);
            if (error instanceof ExecutionCancelledError) throw error;
            return this.error('EXECUTOR_ERROR', 'Compiled artifact integrity validation failed', null, '', '', false, 'artifact_validation');
          }
          timings.artifactValidationMs = Math.round(performance.now() - validationStarted);
        }
      }
      const args = revision.execution.runtimeId === 'cpp'
        ? volumeWorkspace
          ? buildCppVolumeRuntimeDockerArgs(this.config, context.executionId, volumeWorkspace.outputVolume, volumeWorkspace.marker)
          : buildCppRuntimeDockerArgs(this.config, context.executionId, outputDir)
        : buildPythonRuntimeDockerArgs(this.config, context.executionId, sourceDir);
      const strategyArgs = strategy
        ? revision.execution.runtimeId === 'cpp'
          ? volumeWorkspace
            ? buildCppVolumeRuntimeDockerArgs(this.config, context.executionId, volumeWorkspace.outputVolume, volumeWorkspace.marker)
            : buildCppRuntimeDockerArgs(this.config, context.executionId, outputDir)
          : buildStrategyPythonRuntimeDockerArgs(this.config, context.executionId, sourceDir, sdkDir)
        : args;
      const timeoutMs = this.config.defaultTimeoutMs ?? 2_000;
      const runtimeStarted = performance.now();
      const result = await this.runContainer(context.executionId, strategyArgs, JSON.stringify(request), timeoutMs, context.signal);
      timings.runtimeContainerMs = result.elapsedMs ?? Math.round(performance.now() - runtimeStarted);
      timings.cleanupMs += result.cleanupMs ?? 0;
      timings.cleanupSucceeded &&= result.cleanupSucceeded !== false;
      if (result.timedOut) timings.timeoutPhase = 'runtime';
      if (result.cancelled) throw new ExecutionCancelledError();
      if (result.timedOut) return this.error('RUNTIME_TIMEOUT', `Bot runtime timed out after ${timeoutMs}ms`, result.code, result.stdout, result.stderr, true, 'runtime_timeout');
      if (result.killed) return this.error('RESOURCE_LIMIT_EXCEEDED', 'Bot container exceeded a resource limit', result.code, result.stdout, result.stderr, false, 'resource_limit');
      if (result.code === -1 && result.stderr.includes('Docker error:')) return this.error('EXECUTOR_ERROR', 'Docker runtime failed before the Bot process completed', result.code, result.stdout, result.stderr, false, 'docker_infrastructure');
      if (result.code !== 0) return this.error('PROCESS_CRASHED', `Bot container exited with code ${result.code}`, result.code, result.stdout, result.stderr, false, 'runtime_startup');
      return parseRevisionBotResult(result.stdout, result.stderr, result.code);
    } finally {
      // The compiled binary and source are test/job-scoped and never reused.
      // Cleanup is best effort but never occurs before the Docker process exits.
      const cleanupStarted = performance.now();
      if (volumeWorkspace) {
        const volumeCleanup = await this.cleanupVolumeWorkspace(volumeWorkspace);
        timings.cleanupSucceeded &&= volumeCleanup;
      }
      await fs.rm(root, { recursive: true, force: true }).catch(() => { timings.cleanupSucceeded = false; });
      timings.cleanupMs += Math.round(performance.now() - cleanupStarted);
    }
  }

  private activeBackend(execution: SourceRevisionExecution): CppCompilationBackend {
    return execution.runtimeId === 'cpp' && execution.executionMode === 'strategy'
      ? this.config.cppCompilationBackend ?? 'bind'
      : 'bind';
  }

  private imageDigest(image: string): string {
    return image.split('@sha256:')[1] ?? '';
  }

  private compilerConfigDigest(): string {
    return createHash('sha256').update(JSON.stringify({
      image: this.config.imageRegistry.cppCompilerImage,
      flags: COMPILER_FLAGS,
      memory: this.config.memoryLimit ?? '256m',
      cpus: this.config.cpuLimit ?? 1,
      pids: this.config.pidsLimit ?? 64,
      user: this.config.nonRootUser ?? NON_ROOT_USER,
      architecture: 'linux/amd64',
    })).digest('hex');
  }

  private newVolumeWorkspace(): EphemeralVolumeWorkspace {
    const jobId = randomUUID().replaceAll('-', '');
    const marker = `eph-${jobId}`;
    return {
      jobId,
      marker,
      sourceVolume: `ott-src-${jobId}`,
      sdkVolume: `ott-sdk-${jobId}`,
      outputVolume: `ott-bin-${jobId}`,
    };
  }

  private remainingPreparationMs(deadline: number): number {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new WorkspacePreparationError('Preparation deadline exceeded', true);
    return remaining;
  }

  private async prepareVolumeWorkspace(
    workspace: EphemeralVolumeWorkspace,
    sourceDir: string,
    sdkDir: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = performance.now() + (this.config.defaultPreparationTimeoutMs ?? 10_000);
    for (const volume of [workspace.sourceVolume, workspace.sdkVolume, workspace.outputVolume]) {
      if (signal?.aborted) throw new ExecutionCancelledError();
      await this.dockerCommandBounded(
        ['volume', 'create', '--label', `${WORKSPACE_LABEL}=${workspace.marker}`, volume],
        this.remainingPreparationMs(deadline), signal,
      );
    }

    const stage = async (suffix: string, hostDir: string, volume: string, target: string): Promise<void> => {
      const result = await this.runContainer(
        `stage-${workspace.jobId}-${suffix}`,
        this.workspaceUtilityArgs(`stage-${workspace.jobId}-${suffix}`, workspace, [
          '-v', mount(hostDir, '/staging', 'ro'), '-v', volumeMount(volume, target, 'rw'),
        ], ['cp', '-R', '/staging/.', `${target}/`], true),
        undefined, this.remainingPreparationMs(deadline), signal,
      );
      if (result.cancelled) throw new ExecutionCancelledError();
      if (result.timedOut) throw new WorkspacePreparationError(`Staging ${suffix} timed out`, true);
      if (result.code !== 0) throw new WorkspacePreparationError(`Staging ${suffix} failed`);
    };
    await stage('source', sourceDir, workspace.sourceVolume, SOURCE_DIR);
    await stage('sdk', sdkDir, workspace.sdkVolume, '/app/sdk');

    const permissions = await this.runContainer(
      `stage-${workspace.jobId}-permissions`,
      this.workspaceUtilityArgs(`stage-${workspace.jobId}-permissions`, workspace, [
        '-v', volumeMount(workspace.sourceVolume, SOURCE_DIR, 'rw'),
        '-v', volumeMount(workspace.sdkVolume, '/app/sdk', 'rw'),
        '-v', volumeMount(workspace.outputVolume, OUTPUT_DIR, 'rw'),
      ], ['chown', '-R', '65532:65532', SOURCE_DIR, '/app/sdk', OUTPUT_DIR], true, true),
      undefined, this.remainingPreparationMs(deadline), signal,
    );
    if (permissions.cancelled) throw new ExecutionCancelledError();
    if (permissions.timedOut) throw new WorkspacePreparationError('Workspace ownership timed out', true);
    if (permissions.code !== 0) throw new WorkspacePreparationError('Workspace ownership failed');

    const hashes = await this.runContainer(
      `stage-${workspace.jobId}-verify`,
      this.workspaceUtilityArgs(`stage-${workspace.jobId}-verify`, workspace, [
        '-v', volumeMount(workspace.sourceVolume, SOURCE_DIR, 'ro'),
        '-v', volumeMount(workspace.sdkVolume, '/app/sdk', 'ro'),
      ], ['sha256sum', `${SOURCE_DIR}/strategy.cpp`, '/app/sdk/VERSION', '/app/sdk/ott_strategy_sdk.hpp']),
      undefined, this.remainingPreparationMs(deadline), signal,
    );
    if (hashes.cancelled) throw new ExecutionCancelledError();
    if (hashes.timedOut) throw new WorkspacePreparationError('Workspace digest verification timed out', true);
    if (hashes.code !== 0) throw new WorkspacePreparationError('Workspace digest verification failed');
    const expectedFiles = await Promise.all([
      fs.readFile(path.join(sourceDir, 'strategy.cpp')),
      fs.readFile(path.join(sdkDir, 'VERSION')),
      fs.readFile(path.join(sdkDir, 'ott_strategy_sdk.hpp')),
    ]);
    const expected = expectedFiles.map(value => createHash('sha256').update(value).digest('hex'));
    const actual = hashes.stdout.trim().split(/\r?\n/).map(line => line.trim().split(/\s+/)[0]);
    if (actual.length !== expected.length || expected.some((digest, index) => actual[index] !== digest)) {
      throw new WorkspacePreparationError('Staged workspace digest mismatch');
    }
  }

  private workspaceUtilityArgs(
    executionId: string,
    workspace: EphemeralVolumeWorkspace,
    mounts: string[],
    command: string[],
    root = false,
    chown = false,
  ): string[] {
    const args = securityArgs(this.config, executionId);
    const userIndex = args.indexOf('--user');
    if (root && userIndex >= 0) args[userIndex + 1] = '0:0';
    if (root) args.push('--cap-add', 'DAC_OVERRIDE');
    if (chown) args.push('--cap-add', 'CHOWN');
    return [
      ...args,
      '--label', `${WORKSPACE_LABEL}=${workspace.marker}`,
      '--platform', 'linux/amd64',
      ...mounts,
      this.config.imageRegistry.cppCompilerImage,
      ...command,
    ];
  }

  private async validateVolumeArtifact(workspace: EphemeralVolumeWorkspace, signal?: AbortSignal): Promise<string> {
    const timeoutMs = this.config.defaultPreparationTimeoutMs ?? 10_000;
    const inspect = await this.runContainer(
      `validate-${workspace.jobId}-stat`,
      this.workspaceUtilityArgs(`validate-${workspace.jobId}-stat`, workspace, [
        '-v', volumeMount(workspace.outputVolume, '/app/bin', 'ro'),
      ], ['stat', '--format=%F|%a|%u|%g|%s', BINARY_PATH]),
      undefined, timeoutMs, signal,
    );
    if (inspect.cancelled) throw new ExecutionCancelledError();
    const [kind, modeText, uid, gid, sizeText] = inspect.stdout.trim().split('|');
    const mode = Number(modeText); const size = Number(sizeText);
    const ownerMode = Math.floor(mode / 100) % 10;
    const groupMode = Math.floor(mode / 10) % 10;
    const otherMode = mode % 10;
    if (inspect.code !== 0 || kind !== 'regular file' || uid !== '65532' || gid !== '65532' ||
        !Number.isInteger(mode) || (ownerMode & 1) === 0 || (groupMode & 2) !== 0 || (otherMode & 2) !== 0 ||
        !Number.isFinite(size) || size <= 0 || size > ARTIFACT_MAX_BYTES) {
      throw new Error('Artifact metadata is invalid');
    }
    const elf = await this.runContainer(
      `validate-${workspace.jobId}-elf`,
      this.workspaceUtilityArgs(`validate-${workspace.jobId}-elf`, workspace, [
        '-v', volumeMount(workspace.outputVolume, '/app/bin', 'ro'),
      ], ['readelf', '-h', BINARY_PATH]),
      undefined, timeoutMs, signal,
    );
    if (elf.cancelled) throw new ExecutionCancelledError();
    if (elf.code !== 0 || !/Class:\s+ELF64/.test(elf.stdout) || !/Data:\s+2's complement, little endian/.test(elf.stdout) || !/Machine:\s+Advanced Micro Devices X86-64/.test(elf.stdout)) {
      throw new Error('Artifact is not an ELF amd64 executable');
    }
    const digest = await this.runContainer(
      `validate-${workspace.jobId}-hash`,
      this.workspaceUtilityArgs(`validate-${workspace.jobId}-hash`, workspace, [
        '-v', volumeMount(workspace.outputVolume, '/app/bin', 'ro'),
      ], ['sha256sum', BINARY_PATH]),
      undefined, timeoutMs, signal,
    );
    if (digest.cancelled) throw new ExecutionCancelledError();
    const value = digest.stdout.trim().split(/\s+/)[0] ?? '';
    if (digest.code !== 0 || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Artifact digest is invalid');
    return value;
  }

  private async cleanupVolumeWorkspace(workspace: EphemeralVolumeWorkspace): Promise<boolean> {
    let success = true;
    for (const volume of [workspace.sourceVolume, workspace.sdkVolume, workspace.outputVolume]) {
      try {
        const raw = await this.dockerCommandBounded(['volume', 'inspect', '--format', `{{ index .Labels \"${WORKSPACE_LABEL}\" }}`, volume], 5_000);
        if (raw !== workspace.marker) { success = false; continue; }
        await this.dockerCommandBounded(['volume', 'rm', '--force', volume], 10_000);
      } catch (error) {
        if (!(error instanceof Error && /No such volume/i.test(error.message))) success = false;
      }
    }
    return success;
  }

  async terminate(executionId: string): Promise<void> {
    const running = this.running.get(executionId);
    if (running) await this.terminateRunning(running);
  }

  private async runContainer(
    executionId: string,
    args: string[],
    input: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; killed: boolean; cancelled: boolean; elapsedMs: number; cleanupMs: number; cleanupSucceeded: boolean }> {
    const started = performance.now();
    const proc = spawn(this.config.dockerBinary!, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
    const running: RunningProcess = { containerId: `ott-source-${executionId}`, process: proc, killed: false, resolved: false, termination: null };
    this.running.set(executionId, running);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let outputKilled = false;
    const onAbort = () => { cancelled = true; void this.terminateRunning(running); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; void this.terminateRunning(running); }, timeoutMs);
    proc.stdout?.on('data', chunk => {
      if (stdout.length < 1024 * 1024) stdout += Buffer.from(chunk).toString('utf8').slice(0, 1024 * 1024 - stdout.length);
      else { outputKilled = true; void this.terminateRunning(running); }
    });
    proc.stderr?.on('data', chunk => {
      if (outputKilled) return;
      const text = Buffer.from(chunk).toString('utf8');
      const limit = 10 * 1024 * 1024;
      if (stderr.length + text.length > limit) {
        stderr += text.slice(0, limit - stderr.length);
        outputKilled = true;
        void this.terminateRunning(running);
      } else {
        stderr += text;
      }
    });
    if (input !== undefined) { proc.stdin?.write(input); proc.stdin?.end(); }
    else proc.stdin?.end();
    const code = await new Promise<number | null>(resolve => {
      proc.once('error', error => { stderr += `Docker error: ${error.message}\n`; resolve(-1); });
      proc.once('close', resolve);
    });
    running.resolved = true;
    const elapsedMs = Math.round(performance.now() - started);
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    const cleanupStarted = performance.now();
    // A timeout's docker kill must settle before final removal and workspace
    // release; close of the attached CLI alone does not settle that task.
    await running.termination;
    const cleanupSucceeded = await this.removeContainer(running.containerId);
    this.running.delete(executionId);
    const cleanupMs = Math.round(performance.now() - cleanupStarted);
    return { code, stdout, stderr, timedOut, killed: outputKilled || running.killed, cancelled, elapsedMs, cleanupMs, cleanupSucceeded };
  }

  private async terminateRunning(running: RunningProcess): Promise<void> {
    if (running.termination) return running.termination;
    running.killed = true;
    running.termination = (async () => {
      await this.dockerCommand(['kill', running.containerId]).catch(() => {});
      if (!running.resolved) running.process.kill();
    })();
    return running.termination;
  }

  private async removeContainer(containerId: string): Promise<boolean> {
    try {
      await this.dockerCommand(['rm', '--force', containerId]);
      return true;
    } catch (error) {
      // --rm normally removes the container before this idempotent cleanup.
      return error instanceof Error && /No such container/i.test(error.message);
    }
  }

  private dockerCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.dockerBinary!, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
      let stdout = ''; let stderr = '';
      proc.stdout?.on('data', chunk => { stdout += Buffer.from(chunk).toString('utf8'); });
      proc.stderr?.on('data', chunk => { stderr += Buffer.from(chunk).toString('utf8'); });
      proc.once('error', reject);
      proc.once('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `Docker exited with ${code}`)));
    });
  }

  private dockerCommandBounded(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new ExecutionCancelledError()); return; }
      const proc = spawn(this.config.dockerBinary!, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
      let stdout = ''; let stderr = ''; let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(stdout.trim());
      };
      const onAbort = () => { proc.kill(); finish(new ExecutionCancelledError()); };
      const timer = setTimeout(() => {
        proc.kill();
        finish(new WorkspacePreparationError('Docker workspace command timed out', true));
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      proc.stdout?.on('data', chunk => {
        if (stdout.length < 64 * 1024) stdout += Buffer.from(chunk).toString('utf8').slice(0, 64 * 1024 - stdout.length);
      });
      proc.stderr?.on('data', chunk => {
        if (stderr.length < 64 * 1024) stderr += Buffer.from(chunk).toString('utf8').slice(0, 64 * 1024 - stderr.length);
      });
      proc.once('error', error => finish(error));
      proc.once('close', code => finish(code === 0 ? undefined : new WorkspacePreparationError(stderr || `Docker exited with ${code}`)));
    });
  }

  private error(code: BotErrorCode, message: string, exitCode: number | null, stdout: string, stderr: string, timedOut = false, stage?: BotFailureStage): BotExecutionResult {
    return { success: false, error: { code, message, ...(stage ? { stage } : {}) }, exitCode, timedOut, stdout, stderr, durationMs: 0 };
  }
}

export function parseRevisionBotResult(stdout: string, stderr: string, exitCode: number | null): BotExecutionResult {
  const firstLine = stdout.trim().split('\n')[0] ?? '';
  if (!firstLine) return { success: false, error: { code: 'EMPTY_OUTPUT', message: 'Bot produced no output', stage: 'protocol_parsing' }, exitCode, timedOut: false, stdout, stderr, durationMs: 0 };
  try {
    const value = JSON.parse(firstLine) as { move?: { piece_id?: unknown; from?: unknown; to?: unknown } };
    const move = value.move;
    if (!move || typeof move.piece_id !== 'string' || typeof move.from !== 'string' || typeof move.to !== 'string') {
      return { success: false, error: { code: 'INVALID_RESPONSE', message: 'Bot response does not contain a valid move', stage: 'protocol_parsing' }, exitCode, timedOut: false, stdout, stderr, durationMs: 0 };
    }
    if (!/^[a-i][1-9]$/.test(move.from) || !/^[a-i][1-9]$/.test(move.to) || move.from === move.to) {
      return { success: false, error: { code: 'INVALID_MOVE', message: 'Bot response contains an invalid move', stage: 'move_validation' }, exitCode, timedOut: false, stdout, stderr, durationMs: 0 };
    }
    return { success: true, response: { move: { piece_id: move.piece_id, from: move.from, to: move.to } }, exitCode, timedOut: false, stdout, stderr, durationMs: 0 };
  } catch {
    return { success: false, error: { code: 'INVALID_JSON', message: 'Bot output is not valid JSON', stage: 'protocol_parsing' }, exitCode, timedOut: false, stdout, stderr, durationMs: 0 };
  }
}

export function createRevisionDockerExecutor(config: RevisionDockerExecutorConfig): RevisionDockerExecutor { return new RevisionDockerExecutor(config); }

export function createConfiguredRevisionDockerExecutor(
  config: Omit<RevisionDockerExecutorConfig, 'imageRegistry'> & { imageRegistry: Partial<RuntimeImageRegistry> & Pick<RuntimeImageRegistry, 'trustedRegistries'> }
): RevisionDockerExecutor {
  return new RevisionDockerExecutor({ ...config, imageRegistry: createRuntimeImageRegistry(config.imageRegistry, config.executionPolicy) });
}
