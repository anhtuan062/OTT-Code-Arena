/**
 * Bot Executor - Factory
 *
 * Creates the best available executor based on environment and security policy.
 */

import type { BotExecutor, ExecutorConfig, DockerExecutorConfig, ExecutionPolicy } from './types.js';
import { ChildProcessExecutor, createChildProcessExecutor } from './child-process-executor.js';
import { DockerExecutor, createDockerExecutor } from './docker-executor.js';
import { configuredDockerImage } from './image-config.js';

export type ExecutorType = 'auto' | 'child-process' | 'docker';

export interface ExecutorFactoryConfig {
  type?: ExecutorType;
  childProcessConfig?: Partial<ExecutorConfig>;
  dockerConfig?: Partial<DockerExecutorConfig>;
}

let cachedExecutor: BotExecutor | null = null;
let cachedExecutorType: ExecutorType | null = null;
let cachedPolicy: ExecutionPolicy | null = null;

export async function createExecutor(config: ExecutorFactoryConfig = {}): Promise<BotExecutor> {
  // A failed creation must not leave metadata describing a previous executor.
  clearExecutorCache();

  const { type = 'auto', childProcessConfig, dockerConfig } = config;
  const requestedPolicy = childProcessConfig?.executionPolicy ?? dockerConfig?.executionPolicy;
  const production = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
  if (production && requestedPolicy !== 'sandbox-required') {
    throw new Error('Production requires sandbox-required execution policy');
  }
  const policy = requestedPolicy ?? (production ? 'sandbox-required' : 'development');
  if (type === 'child-process') {
    if (policy === 'sandbox-required') throw new Error('Sandbox-required policy does not allow child-process executor');
    cachedExecutor = createChildProcessExecutor(childProcessConfig);
    cachedExecutorType = 'child-process';
    cachedPolicy = policy;
    return cachedExecutor;
  }
  const image = dockerConfig?.image ?? process.env.BOT_DOCKER_IMAGE;
  if (!image && type === 'auto' && policy === 'development') {
    throw new Error('Docker image is not configured; explicitly select child-process for local development only');
  }
  const resolvedDockerConfig = {
    ...dockerConfig,
    executionPolicy: policy,
    image: configuredDockerImage(dockerConfig?.image, policy),
  };

  if (type === 'docker') {
    const dockerExecutor = createDockerExecutor(resolvedDockerConfig);
    const available = await dockerExecutor.isAvailable();
    if (!available) {
      throw new Error('Docker executor requested but Docker is not available');
    }
    cachedExecutor = dockerExecutor;
    cachedExecutorType = 'docker';
    cachedPolicy = policy;
    return cachedExecutor;
  }

  // Auto-detect: try Docker first
  const dockerExecutor = createDockerExecutor(resolvedDockerConfig);
  const available = await dockerExecutor.isAvailable();

  if (available) {
    cachedExecutor = dockerExecutor;
    cachedExecutorType = 'docker';
    cachedPolicy = policy;
    return cachedExecutor;
  }

  // Docker is unavailable. Host execution is never an automatic recovery path;
  // local development must explicitly select type: 'child-process'.
  if (policy === 'sandbox-required') {
    throw new Error('Sandbox-required policy but Docker is not available');
  }
  throw new Error('Docker executor is unavailable; explicitly select child-process for local development only');
}

export function getCachedExecutor(): BotExecutor | null {
  return cachedExecutor;
}

export function getCachedExecutorType(): ExecutorType | null {
  return cachedExecutorType;
}

export function getCachedPolicy(): ExecutionPolicy | null {
  return cachedPolicy;
}

export function clearExecutorCache(): void {
  cachedExecutor = null;
  cachedExecutorType = null;
  cachedPolicy = null;
}

export { ChildProcessExecutor, createChildProcessExecutor } from './child-process-executor.js';
export { DockerExecutor, createDockerExecutor, isSafeExecutionId } from './docker-executor.js';
export { BotRunnerAdapter, createBotRunnerAdapter } from './bot-runner-adapter.js';
export { ExecutionQueue, createExecutionQueue } from './execution-queue.js';
export { ExecutionAuditLogger, createAuditLogger } from './audit-logger.js';
export { configuredDockerImage, validateDockerImage, isProductionImagePolicy } from './image-config.js';
export {
  RevisionDockerExecutor,
  createRevisionDockerExecutor,
  createConfiguredRevisionDockerExecutor,
  buildCppCompileDockerArgs,
  buildCppRuntimeDockerArgs,
  buildPythonRuntimeDockerArgs,
  buildStrategyCppCompileDockerArgs,
  buildStrategyCppVolumeCompileDockerArgs,
  buildCppVolumeRuntimeDockerArgs,
  buildStrategyPythonRuntimeDockerArgs,
  resolveCppCompilationBackend,
  WorkspacePreparationError,
  parseRevisionBotResult,
} from './revision-docker-executor.js';
export { STRATEGY_SDK_VERSION, getStrategySdkIdentity, materializeStrategySdk, strategySdkRoot } from './strategy-sdk.js';
export {
  createRuntimeImageRegistry,
  configuredRuntimeImageRegistry,
  validateRuntimeImage,
  getImageRegistry,
} from './runtime-image-registry.js';
export * from './types.js';
