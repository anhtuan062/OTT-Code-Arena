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
  const policy = childProcessConfig?.executionPolicy ?? dockerConfig?.executionPolicy ?? 'development';
  if (type === 'child-process') {
    if (policy === 'sandbox-required') throw new Error('Sandbox-required policy does not allow child-process executor');
    cachedExecutor = createChildProcessExecutor(childProcessConfig);
    cachedExecutorType = 'child-process';
    cachedPolicy = policy;
    return cachedExecutor;
  }
  const image = dockerConfig?.image ?? process.env.BOT_DOCKER_IMAGE;
  if (!image && type === 'auto' && policy === 'development') {
    cachedExecutor = createChildProcessExecutor(childProcessConfig);
    cachedExecutorType = 'child-process';
    cachedPolicy = policy;
    return cachedExecutor;
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

  // Docker not available - check policy
  if (policy === 'sandbox-required') {
    throw new Error('Sandbox-required policy but Docker is not available');
  }

  // Fallback to child process (development mode only)
  cachedExecutor = createChildProcessExecutor(childProcessConfig);
  cachedExecutorType = 'child-process';
  cachedPolicy = policy;
  return cachedExecutor;
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
export { DockerExecutor, createDockerExecutor } from './docker-executor.js';
export { BotRunnerAdapter, createBotRunnerAdapter } from './bot-runner-adapter.js';
export { ExecutionQueue, createExecutionQueue } from './execution-queue.js';
export { ExecutionAuditLogger, createAuditLogger } from './audit-logger.js';
export { configuredDockerImage, validateDockerImage, isProductionImagePolicy } from './image-config.js';
export * from './types.js';
