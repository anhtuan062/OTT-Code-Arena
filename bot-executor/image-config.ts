import type { ExecutionPolicy } from './types.js';

/** A registry-qualified OCI digest reference. Tags are deliberately excluded. */
const IMMUTABLE_IMAGE = /^(?:localhost(?::[0-9]+)?|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+|(?::[0-9]+)))\/(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[a-f0-9]{64}$/;

export function isProductionImagePolicy(policy?: ExecutionPolicy): boolean {
  return policy === 'sandbox-required' || process.env.NODE_ENV === 'production';
}

export function validateDockerImage(image: string | undefined, policy?: ExecutionPolicy): string {
  if (!image) throw new Error('BOT_DOCKER_IMAGE must be configured');
  if (isProductionImagePolicy(policy) && !IMMUTABLE_IMAGE.test(image)) {
    throw new Error('Production BOT_DOCKER_IMAGE must be a registry-qualified @sha256 digest reference');
  }
  if (!isProductionImagePolicy(policy) && /\s/.test(image)) throw new Error('BOT_DOCKER_IMAGE is malformed');
  return image;
}

export function configuredDockerImage(image: string | undefined, policy?: ExecutionPolicy): string {
  return validateDockerImage(image ?? process.env.BOT_DOCKER_IMAGE, policy);
}
