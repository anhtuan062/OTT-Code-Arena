import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearExecutorCache, configuredDockerImage, createExecutor, validateDockerImage } from '@bot-executor/index.js';
import { appExport, closeServer, initServer, startServer } from '../../server/index.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const digest = 'ghcr.io/anhtuan062/ott-code-arena-bot@sha256:' + 'a'.repeat(64);
const originalImage = process.env.BOT_DOCKER_IMAGE;
const originalNodeEnv = process.env.NODE_ENV;
function restore(name: string, value: string | undefined) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
afterEach(() => { restore('BOT_DOCKER_IMAGE', originalImage); restore('NODE_ENV', originalNodeEnv); clearExecutorCache(); });

describe('Docker image selection', () => {
  it('accepts a registry-qualified immutable digest for sandbox-required execution', () => {
    expect(validateDockerImage(digest, 'sandbox-required')).toBe(digest);
  });
  it('rejects a missing production image', () => {
    expect(() => validateDockerImage(undefined, 'sandbox-required')).toThrow('BOT_DOCKER_IMAGE');
  });
  it('rejects malformed and tag-only production references', () => {
    expect(() => validateDockerImage('ghcr.io/owner/image@sha256:not-a-digest', 'sandbox-required')).toThrow('digest');
    expect(() => validateDockerImage('ghcr.io/owner/image:latest', 'sandbox-required')).toThrow('digest');
    expect(() => validateDockerImage(`owner/image@sha256:${'a'.repeat(64)}`, 'sandbox-required')).toThrow('digest');
  });
  it('allows an explicitly configured local development tag', () => {
    expect(configuredDockerImage('ott-code-arena-bot:dev', 'development')).toBe('ott-code-arena-bot:dev');
  });
  it('requires explicit child-process selection for local development when no image is configured', async () => {
    delete process.env.BOT_DOCKER_IMAGE;
    const executor = await createExecutor({ type: 'child-process', childProcessConfig: { executionPolicy: 'development' } });
    expect(executor.getName()).toBe('child-process');
  });
  it('fails closed rather than falling back to host execution in sandbox-required mode', async () => {
    await expect(createExecutor({ childProcessConfig: { executionPolicy: 'sandbox-required' } })).rejects.toThrow('BOT_DOCKER_IMAGE');
  });
  it('reports an explicitly selected but unavailable Docker runtime without a host fallback', async () => {
    await expect(createExecutor({ type: 'docker', dockerConfig: { image: 'local:test', dockerBinary: '__missing_docker__', executionPolicy: 'development' } })).rejects.toThrow('Docker executor requested but Docker is not available');
  });
  it('fails server initialization before listening when the production image is absent', async () => {
    const previousPolicy = process.env.EXECUTION_POLICY;
    const previousNodeEnv = process.env.NODE_ENV;
    const dir = path.join(os.tmpdir(), `ott-image-config-${Date.now()}`);
    process.env.NODE_ENV = 'production'; process.env.EXECUTION_POLICY = 'sandbox-required'; delete process.env.BOT_DOCKER_IMAGE;
    try { await expect(initServer(dir)).rejects.toThrow('BOT_DOCKER_IMAGE'); }
    finally { closeServer(); restore('EXECUTION_POLICY', previousPolicy); restore('NODE_ENV', previousNodeEnv); await fs.rm(dir, { recursive: true, force: true }); }
  });
  it('does not listen when production image validation fails', async () => {
    const previousPolicy = process.env.EXECUTION_POLICY;
    const previousNodeEnv = process.env.NODE_ENV;
    const listen = vi.spyOn(appExport, 'listen');
    process.env.NODE_ENV = 'production'; process.env.EXECUTION_POLICY = 'sandbox-required'; delete process.env.BOT_DOCKER_IMAGE;
    try {
      await expect(startServer(0)).rejects.toThrow('BOT_DOCKER_IMAGE');
      expect(listen).not.toHaveBeenCalled();
    } finally { listen.mockRestore(); closeServer(); restore('EXECUTION_POLICY', previousPolicy); restore('NODE_ENV', previousNodeEnv); }
  });
});
