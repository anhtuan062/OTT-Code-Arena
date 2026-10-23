import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import * as path from 'node:path';
import type { SourceRevisionExecution, SourceRuntimeId } from '@match-runner/types.js';
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
import { CPP_STRATEGY_WRAPPER_DIGEST, getStrategySdkIdentity, materializeStrategySdk, wrapCppStrategySource } from './strategy-sdk.js';
import { DockerExecutionLimiter, globalDockerExecutionLimiter } from './docker-execution-limiter.js';
import {
  CompiledArtifactCache,
  type CompiledArtifactBuildHandle,
  type CompiledArtifactIdentity,
  type CompiledArtifactHit,
} from './compiled-artifact-cache.js';

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
  /** Stable deployment/environment identity used for resource ownership. */
  resourceEnvironment?: string;
  /** Stable storage namespace. Defaults to a digest of workingDirBase. */
  storageNamespace?: string;
  /** Stable only for the lifetime of one server process. */
  serverInstanceId?: string;
  ownerLeaseTtlMs?: number;
  /** Shared admission control for active Docker execution processes. */
  dockerExecutionLimiter?: DockerExecutionLimiter;
  /** Optional immutable cross-match C++ artifact cache. */
  compiledArtifactCacheDir?: string;
  compiledArtifactCacheMaxBytes?: number;
  compiledArtifactCacheMaxEntries?: number;
  /** Opt-in bridge for C++ artifacts compiled in ephemeral Docker volumes. */
  cppEphemeralArtifactCache?: boolean;
  /** Stage source/SDK bytes into Docker volumes instead of host bind paths. */
  dockerVolumeStaging?: boolean;
}

export type DockerResourceKind = 'compile' | 'runtime' | 'warm' | 'volume' | 'workspace' | 'artifact-import' | 'artifact-export';

export interface DockerResourceOwnership {
  environment: string;
  storageNamespace: string;
  serverInstanceId: string;
  revisionScopeId: string;
  kind: DockerResourceKind;
}

export interface ResourceRecoveryReport {
  reclaimed: string[];
  preserved: Array<{ resource: string; reason: string }>;
}

interface EphemeralVolumeWorkspace {
  jobId: string;
  marker: string;
  sourceVolume: string;
  sdkVolume: string;
  outputVolume: string;
  ownership: DockerResourceOwnership;
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

export class ArtifactTransferError extends Error {
  constructor(message: string, readonly timedOut = false, readonly cancelled = false) {
    super(message);
    this.name = 'ArtifactTransferError';
  }
}

function isExecutionCancellation(error: unknown): error is ExecutionCancelledError {
  return error instanceof ExecutionCancelledError
    || (error instanceof Error && error.name === 'ExecutionCancelledError');
}

interface PreparedRevisionArtifact {
  key: string;
  scopeId: string;
  sourceDigest: string;
  runtimeId: 'cpp' | 'python3';
  executionMode: 'raw' | 'strategy';
  sdkVersion?: string;
  sdkDigest?: string;
  root: string;
  sourceDir: string;
  sdkDir: string;
  outputDir: string;
  volumeWorkspace?: EphemeralVolumeWorkspace;
  artifactDigest?: string;
}

const NON_ROOT_USER = '65532:65532';
const SOURCE_DIR = '/app/source';
const OUTPUT_DIR = '/app/output';
const COMPILED_BINARY_PATH = `${OUTPUT_DIR}/bot`;
const BINARY_PATH = '/app/bin/bot';
const COMPILER_FLAGS = ['-std=c++17', '-O2', '-pipe', '-s', '-static'] as const;
const WORKSPACE_LABEL = 'ott.source.workspace';
const OWNER_LABEL_PREFIX = 'ott.owner.';
const OWNER_LABELS = {
  environment: `${OWNER_LABEL_PREFIX}environment`,
  storageNamespace: `${OWNER_LABEL_PREFIX}storage-namespace`,
  serverInstanceId: `${OWNER_LABEL_PREFIX}server-instance`,
  revisionScopeId: `${OWNER_LABEL_PREFIX}revision-scope`,
  kind: `${OWNER_LABEL_PREFIX}kind`,
} as const;
const ARTIFACT_MAX_BYTES = 64 * 1024 * 1024;
const WORKSPACE_MANIFEST = '.ott-resource-owner.json';

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

export function ownershipLabels(ownership: DockerResourceOwnership): string[] {
  return [
    '--label', `${OWNER_LABELS.environment}=${ownership.environment}`,
    '--label', `${OWNER_LABELS.storageNamespace}=${ownership.storageNamespace}`,
    '--label', `${OWNER_LABELS.serverInstanceId}=${ownership.serverInstanceId}`,
    '--label', `${OWNER_LABELS.revisionScopeId}=${ownership.revisionScopeId}`,
    '--label', `${OWNER_LABELS.kind}=${ownership.kind}`,
  ];
}

function securityArgs(config: RevisionDockerExecutorConfig, executionId: string, ownership?: DockerResourceOwnership): string[] {
  return [
    'run', '-i', '--rm', '--pull=never', '--name', `ott-source-${executionId}`,
    '--network', 'none', '--memory', config.memoryLimit ?? '256m',
    '--cpus', String(config.cpuLimit ?? 1), '--pids-limit', String(config.pidsLimit ?? 64),
    '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=10m',
    '--security-opt', 'no-new-privileges:true', '--cap-drop', 'ALL',
    '--user', config.nonRootUser ?? NON_ROOT_USER,
    ...(ownership ? ownershipLabels(ownership) : []),
  ];
}

function memoryLimitBytes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^([0-9]+(?:\.[0-9]+)?)([kmgt]?i?b?)?$/i.exec(value.trim());
  if (!match) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const factor = unit.startsWith('g') ? 1024 ** 3 : unit.startsWith('m') ? 1024 ** 2 : unit.startsWith('k') ? 1024 : 1;
  return Number(match[1]) * factor;
}

export function configWithResourceLimits(config: RevisionDockerExecutorConfig, limits?: ResourceLimits): RevisionDockerExecutorConfig {
  if (!limits) return config;
  const configuredMemory = memoryLimitBytes(config.memoryLimit);
  const memoryBytes = limits.maxMemoryBytes && limits.maxMemoryBytes > 0
    ? (configuredMemory ? Math.min(configuredMemory, limits.maxMemoryBytes) : limits.maxMemoryBytes)
    : configuredMemory;
  const configuredCpu = config.cpuLimit ?? 1;
  const requestedCpu = limits.maxCpuPercent && limits.maxCpuPercent > 0 ? limits.maxCpuPercent / 100 : configuredCpu;
  const configuredProcesses = config.pidsLimit ?? 64;
  const requestedProcesses = limits.maxProcesses && limits.maxProcesses > 0 ? limits.maxProcesses : configuredProcesses;
  return {
    ...config,
    ...(memoryBytes ? { memoryLimit: `${Math.max(1, Math.floor(memoryBytes))}b` } : {}),
    cpuLimit: Math.max(0.01, Math.min(configuredCpu, requestedCpu)),
    pidsLimit: Math.max(1, Math.min(configuredProcesses, Math.floor(requestedProcesses))),
  };
}

export function buildCppCompileDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  outputDir: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`, ownership),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    '-v', mount(outputDir, '/app/output', 'rw'),
    config.imageRegistry.cppCompilerImage,
    'g++', ...COMPILER_FLAGS, `${SOURCE_DIR}/main.cpp`, '-o', COMPILED_BINARY_PATH,
  ];
}

export function buildCppRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  outputDir: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId, ownership),
    '-v', mount(outputDir, '/app/bin', 'ro'),
    config.imageRegistry.cppRuntimeImage,
    BINARY_PATH,
  ];
}

export function buildPythonRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId, ownership),
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
  outputDir: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`, ownership),
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
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-compile`, ownership),
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
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId, ownership),
    ...(workspaceMarker ? ['--label', `${WORKSPACE_LABEL}=${workspaceMarker}`] : []),
    '--platform', 'linux/amd64',
    '-v', volumeMount(outputVolume, '/app/bin', 'ro'),
    config.imageRegistry.cppRuntimeImage,
    BINARY_PATH,
  ];
}

const ARTIFACT_IMPORT_SCRIPT = 'set -eu; umask 022; cat > /app/bin/.ott-artifact.tmp; chmod 0755 /app/bin/.ott-artifact.tmp; mv -f /app/bin/.ott-artifact.tmp /app/bin/bot';

export function buildCppArtifactImportDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  outputVolume: string,
  workspaceMarker: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-import`, ownership),
    '--label', `${WORKSPACE_LABEL}=${workspaceMarker}`,
    '--platform', 'linux/amd64',
    '-v', volumeMount(outputVolume, '/app/bin', 'rw'),
    config.imageRegistry.cppCompilerImage,
    '/bin/sh', '-c', ARTIFACT_IMPORT_SCRIPT,
  ];
}

export function buildCppArtifactExportDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  outputVolume: string,
  workspaceMarker: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, `${executionId}-export`, ownership),
    '--label', `${WORKSPACE_LABEL}=${workspaceMarker}`,
    '--platform', 'linux/amd64',
    '-v', volumeMount(outputVolume, '/app/bin', 'ro'),
    config.imageRegistry.cppCompilerImage,
    '/bin/cat', '/app/bin/bot',
  ];
}

export function buildStrategyPythonRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceDir: string,
  sdkDir: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId, ownership),
    '-v', mount(sourceDir, SOURCE_DIR, 'ro'),
    '-v', mount(sdkDir, '/app/sdk', 'ro'),
    config.imageRegistry.python3RuntimeImage,
    'python3', '-B', '/app/sdk/runner.py', '/app/source/strategy.py',
  ];
}

export function buildStrategyPythonVolumeRuntimeDockerArgs(
  config: RevisionDockerExecutorConfig,
  executionId: string,
  sourceVolume: string,
  sdkVolume: string,
  workspaceMarker?: string,
  ownership?: DockerResourceOwnership,
): string[] {
  assertSafeId(executionId);
  return [
    ...securityArgs(config, executionId, ownership),
    ...(workspaceMarker ? ['--label', `${WORKSPACE_LABEL}=${workspaceMarker}`] : []),
    '--platform', 'linux/amd64',
    '-v', volumeMount(sourceVolume, SOURCE_DIR, 'ro'),
    '-v', volumeMount(sdkVolume, '/app/sdk', 'ro'),
    config.imageRegistry.python3RuntimeImage,
    'python3', '-B', '/app/sdk/runner.py', '/app/source/strategy.py',
  ];
}

export class RevisionDockerExecutor {
  private readonly config: RevisionDockerExecutorConfig;
  private readonly running = new Map<string, RunningProcess>();
  private readonly preparedArtifacts = new Map<string, PreparedRevisionArtifact>();
  private readonly warmContainers = new Map<string, string>();
  private readonly ownershipConfig: {
    environment: string;
    storageNamespace: string;
    serverInstanceId: string;
    leaseDir: string;
    leaseTtlMs: number;
  };
  private ownershipReady: Promise<void> | null = null;
  private ownerHeartbeat: NodeJS.Timeout | null = null;
  private lastRecoveryReport: ResourceRecoveryReport = { reclaimed: [], preserved: [] };
  private readonly availableRuntimes = new Set<SourceRuntimeId>();
  private allRuntimesAvailable = false;
  private readonly availabilityChecks = new Map<'all' | SourceRuntimeId, Promise<boolean>>();
  private readonly dockerExecutionLimiter: DockerExecutionLimiter;
  private readonly compiledArtifactCache: CompiledArtifactCache;

  constructor(config: RevisionDockerExecutorConfig) {
    this.config = {
      dockerBinary: 'docker',
      workingDirBase: process.cwd(),
      executionPolicy: 'sandbox-required',
      defaultPreparationTimeoutMs: 10_000,
      cppCompilationBackend: 'bind',
      cppEphemeralArtifactCache: false,
      dockerVolumeStaging: false,
      ...config,
    };
    this.config.cppCompilationBackend = resolveCppCompilationBackend(config.cppCompilationBackend);
    this.dockerExecutionLimiter = config.dockerExecutionLimiter ?? globalDockerExecutionLimiter;
    const workingDirBase = path.resolve(this.config.workingDirBase!);
    const storageNamespace = config.storageNamespace?.trim()
      || createHash('sha256').update(workingDirBase).digest('hex').slice(0, 24);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(storageNamespace)) throw new Error('Invalid storage namespace');
    const environment = (config.resourceEnvironment ?? process.env.NODE_ENV ?? 'development').trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(environment)) throw new Error('Invalid resource environment');
    const serverInstanceId = config.serverInstanceId?.trim() || randomUUID();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(serverInstanceId)) throw new Error('Invalid server instance id');
    this.ownershipConfig = {
      environment, storageNamespace, serverInstanceId,
      leaseDir: path.join(workingDirBase, '.revision-owners'),
      leaseTtlMs: Math.max(1_000, Math.min(config.ownerLeaseTtlMs ?? 15_000, 120_000)),
    };
    this.compiledArtifactCache = new CompiledArtifactCache({
      rootDir: config.compiledArtifactCacheDir ?? path.join(workingDirBase, '.compiled-artifacts', environment, storageNamespace),
      environment, storageNamespace, serverInstanceId,
      ownerLeaseDir: this.ownershipConfig.leaseDir,
      ownerLeaseTtlMs: this.ownershipConfig.leaseTtlMs,
      maxBytes: config.compiledArtifactCacheMaxBytes ?? 512 * 1024 * 1024,
      maxEntries: config.compiledArtifactCacheMaxEntries ?? 128,
    });
    // Validate the registry allowlist even when callers construct the class
    // directly; the exported factory is not the only possible entry point.
    this.config.imageRegistry = createRuntimeImageRegistry(this.config.imageRegistry, this.config.executionPolicy);
    for (const image of [this.config.imageRegistry.cppCompilerImage, this.config.imageRegistry.cppRuntimeImage, this.config.imageRegistry.python3RuntimeImage]) {
      validateDockerImage(image, this.config.executionPolicy);
    }
  }

  getName(): string { return 'docker-source-revision'; }

  getValidationIdentity(): string {
    return createHash('sha256').update(JSON.stringify({
      checker: 'ott-preflight-v1',
      images: this.config.imageRegistry,
      compilerFlags: COMPILER_FLAGS,
      compilationBackend: this.config.cppCompilationBackend,
      memoryLimit: this.config.memoryLimit ?? '256m',
      cpuLimit: this.config.cpuLimit ?? 1,
      pidsLimit: this.config.pidsLimit ?? 64,
      runtimeTimeoutMs: this.config.defaultTimeoutMs ?? 2000,
      compileTimeoutMs: this.config.defaultCompileTimeoutMs ?? 30000,
    })).digest('hex');
  }

  getSupportedLimits(): ResourceLimits {
    return {
      maxMemoryBytes: 256 * 1024 * 1024,
      maxProcesses: this.config.pidsLimit ?? 64,
    };
  }

  async isAvailable(runtimeId?: SourceRuntimeId): Promise<boolean> {
    const key: 'all' | SourceRuntimeId = runtimeId ?? 'all';
    if (this.hasCachedAvailability(runtimeId)) return true;
    const existing = this.availabilityChecks.get(key);
    if (existing) return existing;

    const check = this.performAvailabilityCheck(runtimeId).finally(() => {
      if (this.availabilityChecks.get(key) === check) this.availabilityChecks.delete(key);
    });
    this.availabilityChecks.set(key, check);
    return check;
  }

  private hasCachedAvailability(runtimeId?: SourceRuntimeId): boolean {
    if (runtimeId) return this.availableRuntimes.has(runtimeId);
    return this.allRuntimesAvailable || (
      this.availableRuntimes.has('cpp') && this.availableRuntimes.has('python3')
    );
  }

  private async performAvailabilityCheck(runtimeId?: SourceRuntimeId): Promise<boolean> {
    try {
      await this.ensureOwnershipReady();
      await this.dockerCommand(['version', '--format', '{{.Server.Version}}']);
      this.lastRecoveryReport = await this.recoverOwnedResources();
      const images = runtimeId === 'cpp'
        ? [this.config.imageRegistry.cppCompilerImage, this.config.imageRegistry.cppRuntimeImage]
        : runtimeId === 'python3'
          ? [this.config.imageRegistry.python3RuntimeImage]
          : [this.config.imageRegistry.cppCompilerImage, this.config.imageRegistry.cppRuntimeImage, this.config.imageRegistry.python3RuntimeImage];
      for (const image of images) {
        await this.dockerCommand(['image', 'inspect', image]);
      }
      if (runtimeId) this.availableRuntimes.add(runtimeId);
      else {
        this.allRuntimesAvailable = true;
        this.availableRuntimes.add('cpp');
        this.availableRuntimes.add('python3');
      }
      return true;
    } catch {
      // A failed probe must never leave any earlier success cached: the
      // daemon, ownership state, or image set may have changed together.
      this.invalidateAvailability();
      return false;
    }
  }

  private invalidateAvailability(runtimeId?: SourceRuntimeId): void {
    this.allRuntimesAvailable = false;
    if (runtimeId) this.availableRuntimes.delete(runtimeId);
    else this.availableRuntimes.clear();
  }

  getResourceOwnership(): Readonly<Pick<typeof this.ownershipConfig, 'environment' | 'storageNamespace' | 'serverInstanceId'>> {
    return this.ownershipConfig;
  }

  getLastRecoveryReport(): ResourceRecoveryReport { return this.lastRecoveryReport; }

  close(): void {
    if (this.ownerHeartbeat) {
      clearInterval(this.ownerHeartbeat);
      this.ownerHeartbeat = null;
    }
  }

  private ownership(scopeId: string, kind: DockerResourceKind): DockerResourceOwnership {
    assertSafeId(scopeId);
    return { ...this.ownershipConfig, revisionScopeId: scopeId, kind };
  }

  private async ensureOwnershipReady(): Promise<void> {
    if (!this.ownershipReady) {
      this.ownershipReady = (async () => {
        await fs.mkdir(this.ownershipConfig.leaseDir, { recursive: true, mode: 0o700 });
        await this.writeOwnerLease();
        const interval = Math.max(1_000, Math.floor(this.ownershipConfig.leaseTtlMs / 3));
        this.ownerHeartbeat = setInterval(() => { void this.writeOwnerLease().catch(() => {}); }, interval);
        this.ownerHeartbeat.unref();
      })();
    }
    await this.ownershipReady;
  }

  private ownerLeasePath(serverInstanceId: string): string {
    return path.join(this.ownershipConfig.leaseDir, `${serverInstanceId}.json`);
  }

  private async writeOwnerLease(): Promise<void> {
    const lease = {
      environment: this.ownershipConfig.environment,
      storageNamespace: this.ownershipConfig.storageNamespace,
      serverInstanceId: this.ownershipConfig.serverInstanceId,
      pid: process.pid,
      heartbeatAt: Date.now(),
    };
    const target = this.ownerLeasePath(this.ownershipConfig.serverInstanceId);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(lease), { mode: 0o600 });
    await fs.rename(temp, target);
  }

  private async ownerState(serverInstanceId: string): Promise<'active' | 'dead' | 'unknown'> {
    let value: unknown;
    try { value = JSON.parse(await fs.readFile(this.ownerLeasePath(serverInstanceId), 'utf8')); } catch { return 'unknown'; }
    if (!value || typeof value !== 'object') return 'unknown';
    const lease = value as Record<string, unknown>;
    if (lease.environment !== this.ownershipConfig.environment || lease.storageNamespace !== this.ownershipConfig.storageNamespace ||
        lease.serverInstanceId !== serverInstanceId || typeof lease.pid !== 'number' || typeof lease.heartbeatAt !== 'number') return 'unknown';
    if (serverInstanceId === this.ownershipConfig.serverInstanceId) return 'active';
    const fresh = Date.now() - lease.heartbeatAt <= this.ownershipConfig.leaseTtlMs * 2;
    try {
      process.kill(lease.pid, 0);
      return fresh ? 'active' : 'unknown';
    } catch {
      return 'dead';
    }
  }

  private parseOwnershipLabels(raw: string): DockerResourceOwnership | null {
    try {
      const labels = JSON.parse(raw) as Record<string, unknown>;
      const value = {
        environment: labels[OWNER_LABELS.environment],
        storageNamespace: labels[OWNER_LABELS.storageNamespace],
        serverInstanceId: labels[OWNER_LABELS.serverInstanceId],
        revisionScopeId: labels[OWNER_LABELS.revisionScopeId],
        kind: labels[OWNER_LABELS.kind],
      };
      if (Object.values(value).some(item => typeof item !== 'string' || item.length === 0)) return null;
      if (value.environment !== this.ownershipConfig.environment || value.storageNamespace !== this.ownershipConfig.storageNamespace) return null;
      const kind = value.kind as string;
      if (!['compile', 'runtime', 'warm', 'volume', 'workspace', 'artifact-import', 'artifact-export'].includes(kind)) return null;
      return value as DockerResourceOwnership;
    } catch { return null; }
  }

  private async recoverOwnedResources(): Promise<ResourceRecoveryReport> {
    const report: ResourceRecoveryReport = { reclaimed: [], preserved: [] };
    const inspect = async (resource: string, volume: boolean): Promise<DockerResourceOwnership | null> => {
      const args = volume
        ? ['volume', 'inspect', '--format', '{{json .Labels}}', resource]
        : ['inspect', '--format', '{{json .Config.Labels}}', resource];
      const raw = await this.dockerCommandBounded(args, 5_000).catch(() => '');
      return raw ? this.parseOwnershipLabels(raw) : null;
    };
    const collect = async (volume: boolean): Promise<void> => {
      const args = volume ? ['volume', 'ls', '-q', '--filter', `label=${OWNER_LABELS.environment}=${this.ownershipConfig.environment}`, '--filter', `label=${OWNER_LABELS.storageNamespace}=${this.ownershipConfig.storageNamespace}`]
        : ['ps', '-aq', '--filter', `label=${OWNER_LABELS.environment}=${this.ownershipConfig.environment}`, '--filter', `label=${OWNER_LABELS.storageNamespace}=${this.ownershipConfig.storageNamespace}`];
      const listed = await this.dockerCommandBounded(args, 5_000).catch(() => '');
      for (const resource of listed.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
        const ownership = await inspect(resource, volume);
        if (!ownership) { report.preserved.push({ resource, reason: 'missing or invalid ownership metadata' }); continue; }
        const state = await this.ownerState(ownership.serverInstanceId);
        if (state === 'active') { report.preserved.push({ resource, reason: 'owner is active' }); continue; }
        if (state !== 'dead') { report.preserved.push({ resource, reason: 'owner liveness cannot be verified' }); continue; }
        const removeArgs = volume ? ['volume', 'rm', '--force', resource] : ['rm', '--force', resource];
        try { await this.dockerCommandBounded(removeArgs, 10_000); report.reclaimed.push(resource); }
        catch { report.preserved.push({ resource, reason: 'reclaim failed' }); }
      }
    };
    await collect(false);
    await collect(true);
    const root = path.join(this.config.workingDirBase!, 'source-exec');
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[]);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspaceRoot = path.join(root, entry.name);
      let ownership: DockerResourceOwnership | null = null;
      try { ownership = this.parseOwnershipLabels(await fs.readFile(path.join(workspaceRoot, WORKSPACE_MANIFEST), 'utf8')); } catch { /* preserve unknown workspace */ }
      if (!ownership) { report.preserved.push({ resource: workspaceRoot, reason: 'missing or invalid ownership metadata' }); continue; }
      const state = await this.ownerState(ownership.serverInstanceId);
      if (state === 'active') { report.preserved.push({ resource: workspaceRoot, reason: 'owner is active' }); continue; }
      if (state !== 'dead') { report.preserved.push({ resource: workspaceRoot, reason: 'owner liveness cannot be verified' }); continue; }
      try { await this.removeWorkspace(workspaceRoot); report.reclaimed.push(workspaceRoot); }
      catch { report.preserved.push({ resource: workspaceRoot, reason: 'reclaim failed' }); }
    }
    return report;
  }

  private async writeWorkspaceManifest(root: string, ownership: DockerResourceOwnership): Promise<void> {
    const labels = {
      [OWNER_LABELS.environment]: ownership.environment,
      [OWNER_LABELS.storageNamespace]: ownership.storageNamespace,
      [OWNER_LABELS.serverInstanceId]: ownership.serverInstanceId,
      [OWNER_LABELS.revisionScopeId]: ownership.revisionScopeId,
      [OWNER_LABELS.kind]: ownership.kind,
    };
    await fs.writeFile(path.join(root, WORKSPACE_MANIFEST), JSON.stringify(labels), { mode: 0o600 });
  }

  async releaseRevisionScope(scopeId: string): Promise<boolean> {
    const artifacts = [...this.preparedArtifacts.values()].filter(artifact => artifact.scopeId === scopeId);
    let success = true;
    for (const artifact of artifacts) {
      const containerName = this.warmContainers.get(artifact.key);
      if (containerName) {
        success = await this.stopWarmContainer(containerName) && success;
        this.warmContainers.delete(artifact.key);
      }
    }
    for (const artifact of artifacts) this.preparedArtifacts.delete(artifact.key);
    for (const artifact of artifacts) {
      if (artifact.volumeWorkspace) success = (await this.cleanupVolumeWorkspace(artifact.volumeWorkspace)) && success;
      await fs.rm(artifact.root, { recursive: true, force: true }).catch(() => { success = false; });
    }
    return success;
  }

  private preparedArtifactKey(scopeId: string, execution: SourceRevisionExecution): string {
    return [scopeId, execution.competitorId, execution.botId, execution.revisionId].join(':');
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
      runtimeBudgetMs: context.timeoutMs ?? this.config.defaultTimeoutMs ?? 2_000, timeoutPhase: null,
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
    if (!result.success && result.error?.stage === 'docker_infrastructure') {
      this.invalidateAvailability(revision.execution.runtimeId);
    }
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
    const executionConfig = configWithResourceLimits(this.config, context.resourceLimits);
    if (createHash('sha256').update(revision.source).digest('hex') !== revision.execution.sourceDigest) {
      return this.error('SECURITY_VIOLATION', 'Source digest does not match the pinned revision', null, '', '', false, 'source_integrity');
    }
    if (context.resourceLimits?.maxFileSizeBytes && revision.source.byteLength > context.resourceLimits.maxFileSizeBytes) {
      return this.error('RESOURCE_LIMIT_EXCEEDED', 'Source revision exceeds the tournament Bot limit', null, '', '', false, 'source_integrity');
    }
    const readinessStarted = performance.now();
    const available = await this.isAvailable(revision.execution.runtimeId);
    timings.imageReadinessMs = Math.round(performance.now() - readinessStarted);
    if (!available) return this.error('EXECUTOR_ERROR', 'Docker source runtime is unavailable', null, '', '', false, 'docker_infrastructure');

    const artifactKey = context.revisionScopeId
      ? this.preparedArtifactKey(context.revisionScopeId, revision.execution)
      : null;
    const prepared = artifactKey ? this.preparedArtifacts.get(artifactKey) : undefined;
    if (prepared) {
      const identityMatches = prepared.sourceDigest === revision.execution.sourceDigest
        && prepared.runtimeId === revision.execution.runtimeId
        && prepared.executionMode === (revision.execution.executionMode ?? 'raw')
        && prepared.sdkVersion === revision.execution.sdkVersion
        && prepared.sdkDigest === revision.execution.sdkDigest;
      if (!identityMatches) {
        return this.error('SECURITY_VIOLATION', 'Prepared revision identity does not match the pinned revision', null, '', '', false, 'source_integrity');
      }
      if (prepared.artifactDigest) provenance.artifactDigest = prepared.artifactDigest;
      return this.executePreparedRuntime(context, revision, request, prepared, timings);
    }

    const root = path.join(this.config.workingDirBase!, 'source-exec', context.executionId);
    const sourceDir = path.join(root, 'source');
    const sdkDir = path.join(root, 'sdk');
    const outputDir = path.join(root, 'output');
    const sourceName = revision.execution.runtimeId === 'cpp' ? 'main.cpp' : 'main.py';
    let volumeWorkspace: EphemeralVolumeWorkspace | undefined;
    let retainArtifact = false;
    let cacheIdentity: CompiledArtifactIdentity | null = null;
    let cacheBuildHandle: CompiledArtifactBuildHandle | null = null;
    try {
      // A previous attempt can be interrupted after the warm container is
      // created but before the artifact is registered in this process. Stop
      // only the deterministic container for this exact revision scope, then
      // remove its old read-only workspace before writing SDK files again.
      if (artifactKey) await this.recoverStaleWarmContainer(artifactKey);
      await this.removeWorkspace(root);
      // Bind-mounted source/SDK trees must be traversable/readable by the
      // fixed non-root container user. The mounts remain read-only in runtime
      // containers; output stays writable only for the compiler container.
      await fs.mkdir(sourceDir, { recursive: true, mode: 0o755 });
      await fs.mkdir(outputDir, { recursive: true, mode: 0o755 });
      await this.writeWorkspaceManifest(root, this.ownership(context.revisionScopeId ?? context.executionId, 'workspace'));
      const strategy = revision.execution.executionMode === 'strategy';
      if (strategy) {
        const expectedSdk = await getStrategySdkIdentity(revision.execution.runtimeId);
        if (revision.execution.sdkVersion !== expectedSdk.version || revision.execution.sdkDigest !== expectedSdk.digest) {
          return this.error('SECURITY_VIOLATION', 'Pinned strategy SDK identity is unavailable or mismatched', null, '', '', false, 'sdk_resolution');
        }
        await materializeStrategySdk(revision.execution.runtimeId, sdkDir);
        if (revision.execution.runtimeId === 'cpp') {
          const wrapper = wrapCppStrategySource(revision.source.toString('utf8'));
          await fs.writeFile(path.join(sourceDir, 'strategy.cpp'), wrapper, { mode: 0o644 });
        } else {
          await fs.writeFile(path.join(sourceDir, 'strategy.py'), revision.source, { mode: 0o644 });
        }
      } else {
        await fs.writeFile(path.join(sourceDir, sourceName), revision.source, { mode: 0o644 });
      }
      const useVolume = strategy && this.config.cppCompilationBackend === 'ephemeral-volume';
      const volumeCacheEnabled = useVolume && this.config.cppEphemeralArtifactCache === true;
      if (strategy && (revision.execution.runtimeId === 'cpp' || revision.execution.runtimeId === 'python3')) {
        const useVolumeWorkspace = revision.execution.runtimeId === 'python3' || useVolume;
        if (useVolumeWorkspace) {
          volumeWorkspace = this.newVolumeWorkspace(context.revisionScopeId ?? context.executionId);
          const preparationStarted = performance.now();
          try {
            await this.prepareVolumeWorkspace(volumeWorkspace, sourceDir, sdkDir, revision.execution.runtimeId, context.signal);
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
        if (revision.execution.runtimeId !== 'cpp') {
          const artifact: PreparedRevisionArtifact = {
            key: artifactKey ?? '',
            scopeId: context.revisionScopeId ?? '',
            sourceDigest: revision.execution.sourceDigest,
            runtimeId: revision.execution.runtimeId,
            executionMode: revision.execution.executionMode ?? 'raw',
            sdkVersion: revision.execution.sdkVersion,
            sdkDigest: revision.execution.sdkDigest,
            root, sourceDir, sdkDir, outputDir, volumeWorkspace,
            artifactDigest: provenance.artifactDigest,
          };
          if (artifactKey && context.revisionScopeId) this.preparedArtifacts.set(artifactKey, artifact);
          retainArtifact = Boolean(artifactKey && context.revisionScopeId);
          return this.executePreparedRuntime(context, revision, request, artifact, timings);
        }
      }
      if (revision.execution.runtimeId === 'cpp' && (!useVolume || volumeCacheEnabled)) {
        cacheIdentity = this.compiledArtifactIdentity(revision.execution);
        const cacheStarted = performance.now();
        try {
          cacheBuildHandle = await this.compiledArtifactCache.acquire(
            cacheIdentity,
            this.config.defaultCompileTimeoutMs ?? 30_000,
            context.signal,
          );
          if (cacheBuildHandle.hit) {
            if (useVolume && volumeWorkspace) {
              try {
                await this.importArtifactToVolume(
                  context.executionId,
                  cacheBuildHandle.hit,
                  volumeWorkspace,
                  context.signal,
                );
                provenance.artifactDigest = await this.validateVolumeArtifact(volumeWorkspace, context.signal);
              } catch (error) {
                if (isExecutionCancellation(error)) throw error;
                await cacheBuildHandle.release().catch(() => {});
                cacheBuildHandle = null;
                // A transport/cache miss is recoverable. The subsequent
                // compile still uses the fresh, match-scoped volume.
                if (this.isRecoverableArtifactTransferError(error)) {
                  // fall through to the pinned compiler path
                } else {
                  return this.error('EXECUTOR_ERROR', 'Compiled artifact integrity validation failed', null, '', '', false, 'artifact_validation');
                }
              }
            } else {
              await this.compiledArtifactCache.materialize(cacheBuildHandle.hit, outputDir);
              provenance.artifactDigest = cacheBuildHandle.hit.manifest.artifactDigest;
            }
            if (cacheBuildHandle) {
            timings.artifactValidationMs = Math.round(performance.now() - cacheStarted);
            const artifact: PreparedRevisionArtifact = {
              key: artifactKey ?? '',
              scopeId: context.revisionScopeId ?? '',
              sourceDigest: revision.execution.sourceDigest,
              runtimeId: revision.execution.runtimeId,
              executionMode: revision.execution.executionMode ?? 'raw',
              sdkVersion: revision.execution.sdkVersion,
              sdkDigest: revision.execution.sdkDigest,
              root, sourceDir, sdkDir, outputDir, volumeWorkspace,
              artifactDigest: provenance.artifactDigest,
            };
            if (artifactKey && context.revisionScopeId) this.preparedArtifacts.set(artifactKey, artifact);
            await cacheBuildHandle.release();
            cacheBuildHandle = null;
            retainArtifact = Boolean(artifactKey && context.revisionScopeId);
            return this.executePreparedRuntime(context, revision, request, artifact, timings);
            }
          }
        } catch (error) {
          if (cacheBuildHandle) await cacheBuildHandle.release().catch(() => {});
          cacheBuildHandle = null;
          if (isExecutionCancellation(error) || context.signal?.aborted) throw error;
          // Cache failures are isolated from execution; compile the pinned
          // source normally when the optimization storage is unavailable.
        }
      }
      if (revision.execution.runtimeId === 'cpp') {
        const compileStarted = performance.now();
        const compile = await this.runContainer(
          `${context.executionId}-compile`,
          useVolume && volumeWorkspace
            ? buildStrategyCppVolumeCompileDockerArgs(executionConfig, context.executionId, volumeWorkspace.sourceVolume, volumeWorkspace.sdkVolume, volumeWorkspace.outputVolume, volumeWorkspace.marker, this.ownership(context.revisionScopeId ?? context.executionId, 'compile'))
            : strategy
            ? buildStrategyCppCompileDockerArgs(executionConfig, context.executionId, sourceDir, sdkDir, outputDir, this.ownership(context.revisionScopeId ?? context.executionId, 'compile'))
            : buildCppCompileDockerArgs(executionConfig, context.executionId, sourceDir, outputDir, this.ownership(context.revisionScopeId ?? context.executionId, 'compile')),
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
        if (cacheIdentity && cacheBuildHandle) {
          const exported = useVolume && volumeWorkspace
            ? await this.exportArtifactFromVolume(context.executionId, volumeWorkspace, context.signal).catch(error => {
              if (isExecutionCancellation(error)) throw error;
              return null;
            })
            : { path: path.join(outputDir, 'bot'), digest: undefined };
          const published = exported
            ? await this.compiledArtifactCache.publish(cacheIdentity, exported.path).catch(() => null)
            : null;
          if (exported && exported.digest && published && published.manifest.artifactDigest !== exported.digest) {
            await fs.rm(exported.path, { force: true }).catch(() => {});
            throw new Error('Compiled artifact export digest mismatch');
          }
          if (exported && useVolume && volumeWorkspace) await fs.rm(exported.path, { force: true }).catch(() => {});
          if (published) provenance.artifactDigest = published.manifest.artifactDigest;
          await cacheBuildHandle.release().catch(() => {});
          cacheBuildHandle = null;
        }
      }
      const artifact: PreparedRevisionArtifact = {
        key: artifactKey ?? '',
        scopeId: context.revisionScopeId ?? '',
        sourceDigest: revision.execution.sourceDigest,
        runtimeId: revision.execution.runtimeId,
        executionMode: revision.execution.executionMode ?? 'raw',
        sdkVersion: revision.execution.sdkVersion,
        sdkDigest: revision.execution.sdkDigest,
        root, sourceDir, sdkDir, outputDir, volumeWorkspace,
        artifactDigest: provenance.artifactDigest,
      };
      if (artifactKey && context.revisionScopeId) {
        this.preparedArtifacts.set(artifactKey, artifact);
        retainArtifact = true;
      }
      return this.executePreparedRuntime(context, revision, request, artifact, timings);
    } finally {
      if (cacheBuildHandle) await cacheBuildHandle.release().catch(() => {});
      // A match-scoped artifact is released by releaseRevisionScope once the
      // match finishes; one-off executions retain the original eager cleanup.
      if (!retainArtifact) {
        const cleanupStarted = performance.now();
        if (volumeWorkspace) {
          const volumeCleanup = await this.cleanupVolumeWorkspace(volumeWorkspace);
          timings.cleanupSucceeded &&= volumeCleanup;
        }
        await this.removeWorkspace(root).catch(() => { timings.cleanupSucceeded = false; });
        timings.cleanupMs += Math.round(performance.now() - cleanupStarted);
      }
    }
  }

  private async executePreparedRuntime(
    context: ExecutionContext,
    revision: RevisionSource,
    request: BotRequestMessage,
    artifact: PreparedRevisionArtifact,
    timings: RevisionExecutionTimings,
  ): Promise<BotExecutionResult> {
    const executionConfig = configWithResourceLimits(this.config, context.resourceLimits);
    const args = revision.execution.runtimeId === 'cpp'
      ? artifact.volumeWorkspace
        ? buildCppVolumeRuntimeDockerArgs(executionConfig, context.executionId, artifact.volumeWorkspace.outputVolume, artifact.volumeWorkspace.marker, this.ownership(artifact.scopeId || context.executionId, 'warm'))
        : buildCppRuntimeDockerArgs(executionConfig, context.executionId, artifact.outputDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
      : artifact.volumeWorkspace
        ? buildStrategyPythonVolumeRuntimeDockerArgs(executionConfig, context.executionId, artifact.volumeWorkspace.sourceVolume, artifact.volumeWorkspace.sdkVolume, artifact.volumeWorkspace.marker, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
        : buildPythonRuntimeDockerArgs(executionConfig, context.executionId, artifact.sourceDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'));
    const strategyArgs = revision.execution.executionMode === 'strategy'
      ? revision.execution.runtimeId === 'cpp'
        ? args
        : artifact.volumeWorkspace
          ? args
          : buildStrategyPythonRuntimeDockerArgs(this.config, context.executionId, artifact.sourceDir, artifact.sdkDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
      : args;
    const timeoutMs = context.timeoutMs ?? this.config.defaultTimeoutMs ?? 2_000;
    const runtimeStarted = performance.now();
    // Authoritative turns must not share writable container state. In
    // particular, a warm container's /tmp tmpfs survives docker exec and can
    // carry data from one turn into the next. Keep the prepared artifact and
    // compiled-artifact cache, but create a fresh runtime container per turn so
    // filesystem, process and tmpfs state are isolated without changing the
    // bot input/output contract or sandbox limits.
    const result = await this.runContainer(
      context.executionId,
      strategyArgs,
      JSON.stringify(request),
      timeoutMs,
      context.signal,
    );
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
  }

  private activeBackend(execution: SourceRevisionExecution): CppCompilationBackend {
    return execution.runtimeId === 'cpp' && execution.executionMode === 'strategy'
      ? this.config.cppCompilationBackend ?? 'bind'
      : 'bind';
  }

  private compiledArtifactIdentity(execution: SourceRevisionExecution): CompiledArtifactIdentity {
    return {
      sourceDigest: execution.sourceDigest,
      compilerImageDigest: this.imageDigest(this.config.imageRegistry.cppCompilerImage),
      compilerConfigDigest: this.compilerConfigDigest(),
      runtimeImageDigest: this.imageDigest(this.config.imageRegistry.cppRuntimeImage),
      ...(execution.executionMode === 'strategy' ? { strategyWrapperDigest: CPP_STRATEGY_WRAPPER_DIGEST } : {}),
      ...(execution.sdkDigest ? { sdkDigest: execution.sdkDigest } : {}),
      compilationBackend: this.activeBackend(execution),
      executionMode: execution.executionMode ?? 'raw',
    };
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

  private newVolumeWorkspace(scopeId = 'unscoped'): EphemeralVolumeWorkspace {
    const jobId = randomUUID().replaceAll('-', '');
    const marker = `eph-${jobId}`;
    return {
      jobId,
      marker,
      sourceVolume: `ott-src-${jobId}`,
      sdkVolume: `ott-sdk-${jobId}`,
      outputVolume: `ott-bin-${jobId}`,
      ownership: this.ownership(scopeId, 'volume'),
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
    runtimeId: SourceRuntimeId = 'cpp',
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = performance.now() + (this.config.defaultPreparationTimeoutMs ?? 10_000);
    for (const volume of [workspace.sourceVolume, workspace.sdkVolume, workspace.outputVolume]) {
      if (signal?.aborted) throw new ExecutionCancelledError();
      await this.dockerCommandBounded(
        ['volume', 'create', '--label', `${WORKSPACE_LABEL}=${workspace.marker}`, ...ownershipLabels(workspace.ownership), volume],
        this.remainingPreparationMs(deadline), signal,
      );
    }

    const stage = async (suffix: string, hostDir: string, volume: string, target: string): Promise<void> => {
      if (this.config.dockerVolumeStaging) {
        const names = (await fs.readdir(hostDir, { withFileTypes: true }))
          .filter(entry => entry.isFile() && /^[A-Za-z0-9_.-]+$/.test(entry.name))
          .map(entry => entry.name);
        for (const name of names) {
          const content = await fs.readFile(path.join(hostDir, name));
          const destination = `${target}/${name}`;
          const stageScript = `set -eu; umask 022; cat > ${target}/.ott-stage.tmp; mv -f ${target}/.ott-stage.tmp ${destination}`;
          const result = await this.runContainer(
            `stage-${workspace.jobId}-${suffix}-${name.replaceAll('.', '-')}`,
            this.workspaceUtilityArgs(`stage-${workspace.jobId}-${suffix}-${name.replaceAll('.', '-')}`, workspace, [
              '-v', volumeMount(volume, target, 'rw'),
            ], ['/bin/sh', '-c', stageScript], true),
            content, this.remainingPreparationMs(deadline), signal,
          );
          if (result.cancelled) throw new ExecutionCancelledError();
          if (result.timedOut) throw new WorkspacePreparationError(`Staging ${suffix} timed out`, true);
          if (result.code !== 0) throw new WorkspacePreparationError(`Staging ${suffix} failed`);
        }
        return;
      }
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

    const sourceFile = runtimeId === 'cpp' ? 'strategy.cpp' : 'strategy.py';
    const sdkFiles = runtimeId === 'cpp'
      ? ['VERSION', 'ott_strategy_sdk.hpp']
      : ['VERSION', 'ott_strategy_sdk.py', 'runner.py'];
    const stagedPaths = [
      `${SOURCE_DIR}/${sourceFile}`,
      ...sdkFiles.map(file => `/app/sdk/${file}`),
    ];
    const hashes = await this.runContainer(
      `stage-${workspace.jobId}-verify`,
      this.workspaceUtilityArgs(`stage-${workspace.jobId}-verify`, workspace, [
        '-v', volumeMount(workspace.sourceVolume, SOURCE_DIR, 'ro'),
        '-v', volumeMount(workspace.sdkVolume, '/app/sdk', 'ro'),
      ], ['sha256sum', ...stagedPaths]),
      undefined, this.remainingPreparationMs(deadline), signal,
    );
    if (hashes.cancelled) throw new ExecutionCancelledError();
    if (hashes.timedOut) throw new WorkspacePreparationError('Workspace digest verification timed out', true);
    if (hashes.code !== 0) throw new WorkspacePreparationError('Workspace digest verification failed');
    const expectedFiles = await Promise.all([
      fs.readFile(path.join(sourceDir, sourceFile)),
      ...sdkFiles.map(file => fs.readFile(path.join(sdkDir, file))),
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
    const args = securityArgs(this.config, executionId, this.ownership(workspace.ownership.revisionScopeId, 'runtime'));
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
        const raw = await this.dockerCommandBounded(['volume', 'inspect', '--format', '{{json .Labels}}', volume], 5_000);
        const labels = this.parseOwnershipLabels(raw);
        if (!labels || labels.serverInstanceId !== workspace.ownership.serverInstanceId || labels.revisionScopeId !== workspace.ownership.revisionScopeId || !raw.includes(`\"${WORKSPACE_LABEL}\":\"${workspace.marker}\"`)) { success = false; continue; }
        let removed = false;
        for (let attempt = 0; attempt < 5 && !removed; attempt++) {
          try {
            await this.dockerCommandBounded(['volume', 'rm', '--force', volume], 10_000);
            removed = true;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/volume(?: .*?)? is in use|volume is being used/i.test(message) || attempt === 4) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
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

  private warmContainerName(key: string): string {
    return `ott-warm-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
  }

  private async ensureWarmContainer(key: string, runtimeArgs: string[], signal?: AbortSignal): Promise<{ name: string; command: string[]; created: boolean }> {
    const imageIndex = runtimeArgs.findIndex((value, index) => index > 0 && value === this.config.imageRegistry.cppRuntimeImage || value === this.config.imageRegistry.python3RuntimeImage);
    if (imageIndex < 0) throw new Error('Runtime image could not be resolved');
    const name = this.warmContainerName(key);
    const image = runtimeArgs[imageIndex]!;
    const command = runtimeArgs.slice(imageIndex + 1);
    const existing = this.warmContainers.get(key);
    if (existing) return { name: existing, command, created: false };

    const startArgs = runtimeArgs.slice(0, imageIndex + 1);
    const nameIndex = startArgs.indexOf('--name');
    if (nameIndex >= 0 && nameIndex + 1 < startArgs.length) startArgs[nameIndex + 1] = name;
    startArgs.splice(1, 0, '-d');
    startArgs.push('tail', '-f', '/dev/null');
    try {
      await this.dockerExecutionLimiter.run(() => this.dockerCommand(startArgs), signal, `warm-start:${key}`);
    } catch (error) {
      // A previous server can leave a warm container behind after an abrupt
      // shutdown. Reuse is unsafe because its mounted artifact may belong to
      // an older attempt. Recovery is therefore allowed only after ownership
      // metadata and the old owner's liveness have both been verified.
      if (!this.isContainerNameConflict(error)) throw error;
      await this.recoverStaleWarmContainer(key);
      await this.dockerExecutionLimiter.run(() => this.dockerCommand(startArgs), signal, `warm-start:${key}`);
    }
    this.warmContainers.set(key, name);
    return { name, command, created: true };
  }

  private isContainerNameConflict(error: unknown): boolean {
    return error instanceof Error && /name .* is already in use|already in use/i.test(error.message);
  }

  private async recoverStaleWarmContainer(key: string): Promise<void> {
    const name = this.warmContainerName(key);
    const raw = await this.dockerCommandBounded(['inspect', '--format', '{{json .Config.Labels}}', name], 5_000).catch(() => '');
    if (!raw.trim()) return;
    const ownership = this.parseOwnershipLabels(raw);
    if (!ownership || ownership.kind !== 'warm') throw new Error(`Refusing to reclaim warm container ${name}: ownership is not verifiable`);
    const state = await this.ownerState(ownership.serverInstanceId);
    if (state === 'active') throw new Error(`Warm container ${name} is owned by an active server instance`);
    if (state !== 'dead') throw new Error(`Refusing to reclaim warm container ${name}: owner liveness is unknown`);
    await this.stopWarmContainer(name);
  }

  private async removeWorkspace(root: string): Promise<void> {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) await this.removeWorkspace(entryPath);
        else await fs.chmod(entryPath, 0o600).catch(() => {});
      }
      await fs.chmod(root, 0o700).catch(() => {});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.rm(root, { recursive: true, force: true });
  }

  private async stopWarmContainer(name: string): Promise<boolean> {
    await this.dockerCommand(['kill', name]).catch(() => {});
    try {
      await this.dockerCommand(['rm', '--force', name]);
      return true;
    } catch (error) {
      return error instanceof Error && /No such container/i.test(error.message);
    }
  }

  private async runWarmContainer(
    key: string,
    runtimeArgs: string[],
    input: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; killed: boolean; cancelled: boolean; elapsedMs: number; cleanupMs: number; cleanupSucceeded: boolean }> {
    const warm = await this.ensureWarmContainer(key, runtimeArgs, signal);
    const started = performance.now();
    let release: (() => void);
    try {
      release = await this.dockerExecutionLimiter.acquire(signal, `warm-runtime:${key}`);
    } catch (error) {
      await this.stopWarmContainer(warm.name).catch(() => {});
      this.warmContainers.delete(key);
      if (signal?.aborted) throw new ExecutionCancelledError();
      throw error;
    }
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(this.config.dockerBinary!, ['exec', '-i', warm.name, ...warm.command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
    } catch (error) {
      release();
      await this.stopWarmContainer(warm.name).catch(() => {});
      this.warmContainers.delete(key);
      throw error;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); void this.stopWarmContainer(warm.name); }, timeoutMs);
    const onAbort = () => { cancelled = true; proc.kill(); void this.stopWarmContainer(warm.name); };
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.stdout?.on('data', chunk => { stdout += Buffer.from(chunk).toString('utf8').slice(0, 1024 * 1024 - stdout.length); });
    proc.stderr?.on('data', chunk => { stderr += Buffer.from(chunk).toString('utf8').slice(0, 10 * 1024 * 1024 - stderr.length); });
    proc.stdin?.write(input);
    proc.stdin?.end();
    const code = await new Promise<number | null>(resolve => {
      proc.once('error', error => { stderr += `Docker error: ${error.message}\n`; resolve(-1); });
      proc.once('close', resolve);
    });
    // Release before stop/rm cleanup. Cleanup may itself need to invoke Docker
    // and must never wait on the permit held by the operation it terminates.
    release();
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    const cleanupStarted = performance.now();
    // Never retain a writable /tmp tmpfs after a turn. This method is kept as
    // a defensive boundary for callers outside the authoritative path, which
    // now uses runContainer directly for fresh-turn isolation.
    const cleanupSucceeded = await this.stopWarmContainer(warm.name);
    this.warmContainers.delete(key);
    return { code, stdout, stderr, timedOut, killed: timedOut, cancelled, elapsedMs: Math.round(performance.now() - started), cleanupMs: Math.round(performance.now() - cleanupStarted), cleanupSucceeded };
  }

  private async runContainer(
    executionId: string,
    args: string[],
    input: string | Buffer | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; killed: boolean; cancelled: boolean; elapsedMs: number; cleanupMs: number; cleanupSucceeded: boolean }> {
    const started = performance.now();
    let release: (() => void);
    try {
      release = await this.dockerExecutionLimiter.acquire(signal, `revision:${executionId}`);
    } catch (error) {
      if (signal?.aborted) throw new ExecutionCancelledError();
      throw error;
    }
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(this.config.dockerBinary!, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
    } catch (error) {
      release();
      throw error;
    }
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
    release();
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

  private isRecoverableArtifactTransferError(error: unknown): boolean {
    return error instanceof ArtifactTransferError && !error.cancelled;
  }

  private async importArtifactToVolume(
    executionId: string,
    hit: CompiledArtifactHit,
    workspace: EphemeralVolumeWorkspace,
    signal?: AbortSignal,
  ): Promise<void> {
    const stat = await fs.stat(hit.artifactPath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0 || stat.size > ARTIFACT_MAX_BYTES) {
      throw new ArtifactTransferError('Compiled artifact import size is invalid');
    }
    if (signal?.aborted) throw new ExecutionCancelledError();
    const name = `ott-source-${executionId}-import`;
    const args = buildCppArtifactImportDockerArgs(
      this.config, executionId, workspace.outputVolume, workspace.marker,
      this.ownership(workspace.ownership.revisionScopeId, 'artifact-import'),
    );
    await this.runArtifactTransfer(name, args, signal, async proc => {
      const input = createReadStream(hit.artifactPath);
      try {
        await new Promise<void>((resolve, reject) => {
          input.once('error', reject);
          proc.stdin?.once('error', reject);
          proc.stdin?.once('finish', resolve);
          input.pipe(proc.stdin!);
        });
      } finally {
        input.destroy();
      }
    });
  }

  private async exportArtifactFromVolume(
    executionId: string,
    workspace: EphemeralVolumeWorkspace,
    signal?: AbortSignal,
  ): Promise<{ path: string; digest: string }> {
    const exportDir = path.join(this.config.workingDirBase!, 'source-exec', executionId);
    await fs.mkdir(exportDir, { recursive: true, mode: 0o700 });
    const target = path.join(exportDir, `.artifact-export.${randomUUID()}.tmp`);
    let streamedDigest = '';
    const name = `ott-source-${executionId}-export`;
    const args = buildCppArtifactExportDockerArgs(
      this.config, executionId, workspace.outputVolume, workspace.marker,
      this.ownership(workspace.ownership.revisionScopeId, 'artifact-export'),
    );
    try {
      await this.runArtifactTransfer(name, args, signal, async proc => {
        const output = createWriteStream(target, { flags: 'wx', mode: 0o700 });
        const hash = createHash('sha256');
        let bytes = 0;
        const outputError = new Promise<never>((_resolve, reject) => {
          output.once('error', reject);
        });
        try {
          for await (const chunk of proc.stdout!) {
            const value = Buffer.from(chunk as Buffer);
            bytes += value.length;
            if (bytes > ARTIFACT_MAX_BYTES) throw new ArtifactTransferError('Compiled artifact export exceeded 64 MiB');
            hash.update(value);
            if (!output.write(value)) await Promise.race([
              new Promise<void>(resolve => output.once('drain', resolve)),
              outputError,
            ]);
          }
          await Promise.race([
            new Promise<void>(resolve => output.end(() => resolve())),
            outputError,
          ]);
          if (bytes <= 0) throw new ArtifactTransferError('Compiled artifact export was empty');
          await fs.chmod(target, 0o755).catch(() => {});
          await this.validateExportedArtifactFile(target);
          streamedDigest = hash.digest('hex');
        } catch (error) {
          output.destroy();
          throw error;
        }
      });
      return { path: target, digest: streamedDigest };
    } catch (error) {
      await fs.rm(target, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async validateExportedArtifactFile(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0 || stat.size > ARTIFACT_MAX_BYTES) {
      throw new ArtifactTransferError('Compiled artifact export size is invalid');
    }
    const handle = await fs.open(filePath, 'r');
    try {
      const header = Buffer.alloc(20);
      const read = await handle.read(header, 0, header.length, 0);
      if (read.bytesRead < header.length || header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46 || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 0x3e) {
        throw new ArtifactTransferError('Compiled artifact export is not a valid ELF amd64 binary');
      }
    } finally {
      await handle.close();
    }
  }

  private async runArtifactTransfer(
    containerId: string,
    args: string[],
    signal: AbortSignal | undefined,
    stream: (process: ReturnType<typeof spawn>) => Promise<void>,
  ): Promise<void> {
    let release: (() => void);
    try {
      release = await this.dockerExecutionLimiter.acquire(signal, `revision:${containerId}`);
    } catch (error) {
      if (signal?.aborted) throw new ExecutionCancelledError();
      throw new ArtifactTransferError(`Artifact transfer admission failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let proc: ReturnType<typeof spawn>;
    try {
      proc = this.spawnArtifactProcess(args);
    } catch (error) {
      release();
      throw new ArtifactTransferError(`Artifact transfer spawn failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let timedOut = false;
    let cancelled = false;
    let stderr = '';
    const timeoutMs = this.config.defaultCompileTimeoutMs ?? 30_000;
    const timer = setTimeout(() => { timedOut = true; void this.terminateArtifactTransfer(proc, containerId); }, timeoutMs);
    const onAbort = () => { cancelled = true; void this.terminateArtifactTransfer(proc, containerId); };
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.stderr?.on('data', chunk => {
      if (stderr.length < 64 * 1024) stderr += Buffer.from(chunk).toString('utf8').slice(0, 64 * 1024 - stderr.length);
    });
    const close = new Promise<number | null>(resolve => {
      proc.once('error', error => { stderr += `Docker error: ${error.message}`; resolve(-1); });
      proc.once('close', resolve);
    });
    let code: number | null = null;
    try {
      await stream(proc);
      proc.stdin?.end();
      code = await close;
    } catch (error) {
      await this.terminateArtifactTransfer(proc, containerId);
      await close;
      throw error;
    } finally {
      release();
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      await this.removeContainer(containerId);
    }
    if (cancelled || signal?.aborted) throw new ExecutionCancelledError();
    if (timedOut) throw new ArtifactTransferError('Artifact transfer timed out', true);
    if (code !== 0) throw new ArtifactTransferError(`Artifact transfer failed: ${stderr.slice(0, 1024)}`);
  }

  private async terminateArtifactTransfer(proc: ReturnType<typeof spawn>, containerId: string): Promise<void> {
    await this.dockerCommand(['kill', containerId]).catch(() => {});
    if (!proc.killed) proc.kill();
  }

  private spawnArtifactProcess(args: string[]): ReturnType<typeof spawn> {
    return spawn(this.config.dockerBinary!, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
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
