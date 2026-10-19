import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process';
import * as fs from 'node:fs/promises';
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
import { getStrategySdkIdentity, materializeStrategySdk, wrapCppStrategySource } from './strategy-sdk.js';
import { DockerExecutionLimiter, globalDockerExecutionLimiter } from './docker-execution-limiter.js';

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
}

export type DockerResourceKind = 'compile' | 'runtime' | 'warm' | 'volume' | 'workspace';

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
  private available = false;
  private readonly dockerExecutionLimiter: DockerExecutionLimiter;

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
    if (this.available) return true;
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
      if (!runtimeId) this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
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
      if (!['compile', 'runtime', 'warm', 'volume', 'workspace'].includes(kind)) return null;
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
          return this.executePreparedRuntime(context, revision, request, artifact, timings);
        }
      }
      if (revision.execution.runtimeId === 'cpp') {
        const compileStarted = performance.now();
        const compile = await this.runContainer(
          `${context.executionId}-compile`,
          useVolume && volumeWorkspace
            ? buildStrategyCppVolumeCompileDockerArgs(this.config, context.executionId, volumeWorkspace.sourceVolume, volumeWorkspace.sdkVolume, volumeWorkspace.outputVolume, volumeWorkspace.marker, this.ownership(context.revisionScopeId ?? context.executionId, 'compile'))
            : strategy
            ? buildStrategyCppCompileDockerArgs(this.config, context.executionId, sourceDir, sdkDir, outputDir, this.ownership(context.revisionScopeId ?? context.executionId, 'compile'))
            : buildCppCompileDockerArgs(this.config, context.executionId, sourceDir, outputDir, this.ownership(context.revisionScopeId ?? context.executionId, 'compile')),
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
    const args = revision.execution.runtimeId === 'cpp'
      ? artifact.volumeWorkspace
        ? buildCppVolumeRuntimeDockerArgs(this.config, context.executionId, artifact.volumeWorkspace.outputVolume, artifact.volumeWorkspace.marker, this.ownership(artifact.scopeId || context.executionId, 'warm'))
        : buildCppRuntimeDockerArgs(this.config, context.executionId, artifact.outputDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
      : artifact.volumeWorkspace
        ? buildStrategyPythonVolumeRuntimeDockerArgs(this.config, context.executionId, artifact.volumeWorkspace.sourceVolume, artifact.volumeWorkspace.sdkVolume, artifact.volumeWorkspace.marker, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
        : buildPythonRuntimeDockerArgs(this.config, context.executionId, artifact.sourceDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'));
    const strategyArgs = revision.execution.executionMode === 'strategy'
      ? revision.execution.runtimeId === 'cpp'
        ? args
        : artifact.volumeWorkspace
          ? args
          : buildStrategyPythonRuntimeDockerArgs(this.config, context.executionId, artifact.sourceDir, artifact.sdkDir, this.ownership(artifact.scopeId || context.executionId, artifact.key ? 'warm' : 'runtime'))
      : args;
    const timeoutMs = context.timeoutMs ?? this.config.defaultTimeoutMs ?? 2_000;
    const runtimeStarted = performance.now();
    const result = process.env.NODE_ENV !== 'test' && artifact.key
      ? await this.runWarmContainer(artifact.key, strategyArgs, JSON.stringify(request), timeoutMs, context.signal)
      : await this.runContainer(context.executionId, strategyArgs, JSON.stringify(request), timeoutMs, context.signal);
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
      if (warm.created) {
        await this.stopWarmContainer(warm.name).catch(() => {});
        this.warmContainers.delete(key);
      }
      if (signal?.aborted) throw new ExecutionCancelledError();
      throw error;
    }
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(this.config.dockerBinary!, ['exec', '-i', warm.name, ...warm.command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true } as SpawnOptionsWithoutStdio);
    } catch (error) {
      release();
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
    const cleanupSucceeded = timedOut || cancelled ? await this.stopWarmContainer(warm.name) : true;
    if (timedOut || cancelled) this.warmContainers.delete(key);
    return { code, stdout, stderr, timedOut, killed: timedOut, cancelled, elapsedMs: Math.round(performance.now() - started), cleanupMs: Math.round(performance.now() - cleanupStarted), cleanupSucceeded };
  }

  private async runContainer(
    executionId: string,
    args: string[],
    input: string | undefined,
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
