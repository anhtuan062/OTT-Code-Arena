import type { ExecutionPolicy } from './types.js';
import { isProductionImagePolicy, validateDockerImage } from './image-config.js';

export type SourceRuntimeId = 'cpp' | 'python3';

export interface RuntimeImageRegistry {
  cppCompilerImage: string;
  cppRuntimeImage: string;
  python3RuntimeImage: string;
  trustedRegistries: string[];
}

const DIGEST_IMAGE = /^(?<registry>[^/]+)\/.+@sha256:[a-f0-9]{64}$/;

function registryOf(image: string): string {
  const match = DIGEST_IMAGE.exec(image);
  return match?.groups?.registry ?? '';
}

/**
 * Source revisions are never allowed to use mutable tags.  The trusted
 * registry list is server configuration, not data supplied by a competitor.
 */
export function validateRuntimeImage(
  image: string | undefined,
  name: string,
  policy: ExecutionPolicy | undefined,
  trustedRegistries: readonly string[]
): string {
  if (!image) throw new Error(`${name} must be configured`);
  const match = DIGEST_IMAGE.exec(image);
  if (!match || !match.groups?.registry) {
    throw new Error(`${name} must be an immutable image from a trusted registry`);
  }
  validateDockerImage(image, policy);
  if (!trustedRegistries.includes(match.groups.registry)) {
    throw new Error(`${name} must be an immutable image from a trusted registry`);
  }
  // Production/sandbox-required also retains the existing registry-qualified
  // digest policy.  Keep this explicit so a future image validator cannot
  // accidentally weaken source execution policy.
  if (isProductionImagePolicy(policy) && !match.groups.registry) {
    throw new Error(`${name} must be registry-qualified`);
  }
  return image;
}

export function createRuntimeImageRegistry(
  config: Partial<RuntimeImageRegistry> & Pick<RuntimeImageRegistry, 'trustedRegistries'>,
  policy: ExecutionPolicy | undefined = 'sandbox-required'
): RuntimeImageRegistry {
  const trustedRegistries = [...config.trustedRegistries]
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  if (trustedRegistries.length === 0) {
    throw new Error('At least one trusted source image registry must be configured');
  }
  return {
    trustedRegistries,
    cppCompilerImage: validateRuntimeImage(config.cppCompilerImage, 'BOT_CPP_COMPILER_IMAGE', policy, trustedRegistries),
    cppRuntimeImage: validateRuntimeImage(config.cppRuntimeImage, 'BOT_CPP_RUNTIME_IMAGE', policy, trustedRegistries),
    python3RuntimeImage: validateRuntimeImage(config.python3RuntimeImage, 'BOT_PYTHON3_RUNTIME_IMAGE', policy, trustedRegistries),
  };
}

export function configuredRuntimeImageRegistry(
  policy: ExecutionPolicy | undefined = 'sandbox-required',
  env: NodeJS.ProcessEnv = process.env
): RuntimeImageRegistry {
  const registries = (env.BOT_TRUSTED_IMAGE_REGISTRIES ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return createRuntimeImageRegistry({
    trustedRegistries: registries,
    cppCompilerImage: env.BOT_CPP_COMPILER_IMAGE,
    cppRuntimeImage: env.BOT_CPP_RUNTIME_IMAGE,
    python3RuntimeImage: env.BOT_PYTHON3_RUNTIME_IMAGE,
  }, policy);
}

export function getImageRegistry(image: string): string {
  return registryOf(image);
}
