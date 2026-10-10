import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createExecutor,
  clearExecutorCache,
  getCachedExecutorType,
  getCachedPolicy,
} from '@bot-executor/index.js';
import { appExport, initServer, resolveExecutionPolicy, startServer } from '../../server/index.js';

describe('Execution Policy', () => {
  const unavailableDocker = { dockerBinary: '__ott_missing_docker_for_test__' };

  beforeEach(() => {
    clearExecutorCache();
  });

  afterEach(() => {
    clearExecutorCache();
  });

  describe('sandbox-required mode', () => {
    it('requires explicit sandbox policy in production', () => {
      expect(resolveExecutionPolicy({
        NODE_ENV: 'production',
        EXECUTION_POLICY: 'sandbox-required',
      })).toBe('sandbox-required');
      expect(() => resolveExecutionPolicy({ NODE_ENV: 'production' }))
        .toThrow('Production requires EXECUTION_POLICY=sandbox-required');
      expect(() => resolveExecutionPolicy({
        NODE_ENV: 'production',
        EXECUTION_POLICY: 'development',
      })).toThrow('Production requires EXECUTION_POLICY=sandbox-required');
    });

    it('rejects invalid security configuration instead of selecting development', () => {
      expect(() => resolveExecutionPolicy({ NODE_ENV: 'prod' }))
        .toThrow('Invalid NODE_ENV');
      expect(() => resolveExecutionPolicy({}))
        .toThrow('NODE_ENV or EXECUTION_POLICY must be explicitly configured');
      expect(() => resolveExecutionPolicy({
        NODE_ENV: 'production',
        EXECUTION_POLICY: 'sandbox',
      })).toThrow('Invalid EXECUTION_POLICY');
    });

    it('prevents server initialization with invalid production security configuration', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousPolicy = process.env.EXECUTION_POLICY;
      process.env.NODE_ENV = 'production';
      delete process.env.EXECUTION_POLICY;
      try {
        await expect(initServer()).rejects.toThrow('Production requires EXECUTION_POLICY=sandbox-required');
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousPolicy === undefined) delete process.env.EXECUTION_POLICY;
        else process.env.EXECUTION_POLICY = previousPolicy;
      }
    });

    it('does not listen when server initialization fails', async () => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousPolicy = process.env.EXECUTION_POLICY;
      const listenSpy = vi.spyOn(appExport, 'listen');
      process.env.NODE_ENV = 'production';
      delete process.env.EXECUTION_POLICY;
      try {
        await expect(startServer(0)).rejects.toThrow('Production requires EXECUTION_POLICY=sandbox-required');
        expect(listenSpy).not.toHaveBeenCalled();
      } finally {
        listenSpy.mockRestore();
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousPolicy === undefined) delete process.env.EXECUTION_POLICY;
        else process.env.EXECUTION_POLICY = previousPolicy;
      }
    });

    it('should reject child-process executor when sandbox-required', async () => {
      await expect(
        createExecutor({
          type: 'child-process',
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Sandbox-required policy does not allow child-process executor');
    });

    it('should reject auto mode when Docker unavailable and sandbox-required', async () => {
      await expect(
        createExecutor({
          type: 'auto',
          dockerConfig: unavailableDocker,
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Sandbox-required policy but Docker is not available');
    });

    it('should reject explicit docker type when Docker unavailable', async () => {
      await expect(
        createExecutor({
          type: 'docker',
          dockerConfig: { ...unavailableDocker, executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Docker executor requested but Docker is not available');
    });

    it('should not cache executor when sandbox-required fails', async () => {
      await createExecutor({ type: 'child-process' });
      try {
        await createExecutor({
          type: 'auto',
          dockerConfig: unavailableDocker,
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        });
      } catch {}
      expect(getCachedExecutorType()).toBeNull();
      expect(getCachedPolicy()).toBeNull();
    });

    it('should not silently fall back to child-process in sandbox-required auto mode', async () => {
      let threw = false;
      try {
        await createExecutor({
          type: 'auto',
          dockerConfig: { ...unavailableDocker, image: 'test:latest', executionPolicy: 'sandbox-required' },
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(getCachedExecutorType()).not.toBe('child-process');
      expect(getCachedExecutorType()).toBeNull();
    });
  });

  describe('development mode', () => {
    it('keeps missing NODE_ENV compatible with development workflows', () => {
      expect(resolveExecutionPolicy({ EXECUTION_POLICY: 'development' })).toBe('development');
      expect(resolveExecutionPolicy({
        NODE_ENV: 'test',
        EXECUTION_POLICY: 'development',
      })).toBe('development');
    });

    it('should allow child-process executor in development mode', async () => {
      const executor = await createExecutor({
        type: 'child-process',
        childProcessConfig: { executionPolicy: 'development' },
      });
      expect(executor).toBeDefined();
      expect(executor.getName()).toBe('child-process');
      expect(getCachedPolicy()).toBe('development');
    });

    it('should fall back to child-process when Docker unavailable in development auto mode', async () => {
      const executor = await createExecutor({
        type: 'auto',
        dockerConfig: unavailableDocker,
        childProcessConfig: { executionPolicy: 'development' },
      });
      expect(executor).toBeDefined();
      expect(getCachedExecutorType()).toBe('child-process');
      expect(getCachedPolicy()).toBe('development');
    });

    it('should default to development policy when not specified', async () => {
      const executor = await createExecutor({ type: 'child-process' });
      expect(executor).toBeDefined();
      expect(getCachedPolicy()).toBe('development');
    });
  });

  describe('executor factory cache', () => {
    it('should clear cache correctly', async () => {
      await createExecutor({ type: 'child-process' });
      expect(getCachedExecutorType()).toBe('child-process');
      clearExecutorCache();
      expect(getCachedExecutorType()).toBeNull();
      expect(getCachedPolicy()).toBeNull();
    });
  });

  describe('tournament manager sandbox-required integration', () => {
    it('should propagate sandbox-required failure through createTournamentManager', async () => {
      const { createTournamentManager } = await import('@tournament/manager.js');
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');

      const tmpDir = path.join(os.tmpdir(), `ott-policy-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        await expect(
          createTournamentManager(tmpDir, undefined, 'sandbox-required', {
            dockerConfig: unavailableDocker,
          })
        ).rejects.toThrow();
      } finally {
        clearExecutorCache();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
